'use strict';

var express = require('express');
var router  = express.Router();
var path    = require('path');
var db      = require('../config/db');
var auth    = require('../utils/auth');
var upload  = require('../middleware/upload');
require('dotenv').config();

// Helper: send Telegram notification to a user
function _notifyUser(userId, telegramId, message, frontendUrl) {
  if (!telegramId || telegramId < 1000) return;
  var bot = null;
  try { bot = require('../bot/index').bot; } catch(e) {}
  if (!bot) return;
  bot.telegram.sendMessage(telegramId, message, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🎮 Open KEBRCHACHA', web_app: { url: frontendUrl } }
      ]]
    }
  }).catch(function() {});
}

/**
 * POST /api/payments/upload
 * User uploads payment screenshot for a ticket
 */
router.post('/upload', auth.requireAuth, upload.single('screenshot'), function(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Screenshot image is required' });
  }

  var ticketId = parseInt(req.body.ticket_id);
  var userId   = req.user.id;

  if (!ticketId) {
    return res.status(400).json({ error: 'ticket_id is required' });
  }

  // Verify ticket belongs to user and is pending
  db.execute(
    'SELECT t.*, r.entry_fee, r.title AS room_title FROM tickets t JOIN rooms r ON t.room_id = r.id WHERE t.id = ? AND t.user_id = ? AND t.status = "pending"',
    [ticketId, userId]
  )
    .then(function(results) {
      var tickets = results[0];
      if (!tickets || tickets.length === 0) {
        return Promise.reject({ status: 404, message: 'Ticket not found or not pending' });
      }

      var ticket = tickets[0];

      // Block duplicate payment uploads
      return db.execute(
        'SELECT id FROM payments WHERE ticket_id = ? AND status IN ("pending","approved")',
        [ticketId]
      ).then(function(dupResults) {
        if (dupResults[0] && dupResults[0].length > 0) {
          return Promise.reject({ status: 409, message: 'Payment already submitted for this ticket. Awaiting review.' });
        }

        var screenshotPath = req.file.path;
        return db.execute(
          'INSERT INTO payments (ticket_id, user_id, room_id, amount, screenshot_path) VALUES (?, ?, ?, ?, ?)',
          [ticketId, userId, ticket.room_id, ticket.entry_fee, screenshotPath]
        ).then(function(insertResult) {
          return { ticket: ticket, paymentId: insertResult[0].insertId };
        });
      });
    })
    .then(function(data) {
      // Notify admin via socket
      if (req.app.get('io')) {
        req.app.get('io').emit('payment:new', {
          payment_id: data.paymentId,
          ticket_id:  ticketId,
          room_id:    data.ticket.room_id,
          username:   req.user.username,
          number:     data.ticket.number
        });
      }

      return res.status(201).json({
        message:    'Payment screenshot uploaded. Awaiting admin verification.',
        payment_id: data.paymentId
      });
    })
    .catch(function(err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('[Payments/upload] Error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    });
});

/**
 * GET /api/payments/pending
 * Admin only: List all pending payments
 */
router.get('/pending', auth.requireAdmin, function(req, res) {
  var sql = [
    'SELECT p.*,',
    '  u.username, u.first_name, u.last_name,',
    '  t.number AS ticket_number,',
    '  r.title AS room_title',
    'FROM payments p',
    'JOIN users u   ON p.user_id   = u.id',
    'JOIN tickets t ON p.ticket_id = t.id',
    'JOIN rooms r   ON p.room_id   = r.id',
    'WHERE p.status = "pending"',
    'ORDER BY p.created_at ASC'
  ].join(' ');

  db.execute(sql)
    .then(function(results) {
      var payments = results[0].map(function(p) {
        p.screenshot_url = '/uploads/' + path.basename(path.dirname(p.screenshot_path)) + '/' + path.basename(p.screenshot_path);
        return p;
      });
      return res.json({ payments: payments });
    })
    .catch(function(err) {
      console.error('[Payments/pending] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch payments' });
    });
});

/**
 * POST /api/payments/:id/approve
 * Admin only: Approve a payment → ticket becomes "verified" (green/taken)
 */
router.post('/:id/approve', auth.requireAdmin, function(req, res) {
  var paymentId = parseInt(req.params.id);
  var adminId   = req.user.id;

  db.execute('SELECT * FROM payments WHERE id = ? AND status = "pending"', [paymentId])
    .then(function(results) {
      var payments = results[0];
      if (!payments || payments.length === 0) {
        return Promise.reject({ status: 404, message: 'Payment not found or already reviewed' });
      }

      var payment = payments[0];

      // Update payment status
      return db.execute(
        'UPDATE payments SET status = "approved", reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        [adminId, paymentId]
      ).then(function() {
        // Update ticket status to verified
        return db.execute(
          'UPDATE tickets SET status = "verified" WHERE id = ?',
          [payment.ticket_id]
        );
      }).then(function() {
        return payment;
      });
    })
    .then(function(payment) {
      // Update room filled_slots count
      return db.execute(
        'UPDATE rooms SET filled_slots = filled_slots + 1 WHERE id = ?',
        [payment.room_id]
      ).then(function() {
        return db.execute('SELECT * FROM rooms WHERE id = ?', [payment.room_id]);
      }).then(function(results) {
        return { payment: payment, room: results[0][0] };
      });
    })
    .then(function(data) {
      var room    = data.room;
      var payment = data.payment;

      // Get ticket info for socket broadcast
      return db.execute(
        'SELECT t.*, u.username, u.first_name, u.last_name FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.id = ?',
        [payment.ticket_id]
      ).then(function(results) {
        var ticket = results[0][0];

        // Broadcast to all users: number is now TAKEN (red)
        if (req.app.get('io')) {
          req.app.get('io').emit('ticket:verified', {
            room_id:    payment.room_id,
            ticket_id:  payment.ticket_id,
            number:     ticket.number,
            username:   ticket.username,
            first_name: ticket.first_name,
            last_name:  ticket.last_name,
            status:     'taken'
          });

          // If room is now full, lock it
          if (room.filled_slots >= room.total_slots) {
            req.app.get('io').emit('room:locked', { room_id: room.id });
          }
        }

        // Lock room if full
        if (room.filled_slots >= room.total_slots) {
          return db.execute(
            'UPDATE rooms SET status = "locked" WHERE id = ?',
            [room.id]
          ).then(function() {
            // Notify user via bot
            _notifyUser(ticket.user_id, ticket.telegram_id,
              '✅ ክፍያ ፀድቋል!\n\nቁጥርዎ #' + ticket.number + ' ተረጋግጧል።\n\n🔒 ክፍሉ ሞልቷል! ዕጣ ብዙም ሳይቆይ ይጀምራል። መልካም እድል! 🍀',
              process.env.FRONTEND_URL || 'http://localhost:5173'
            );
            return res.json({ message: 'ክፍያ ፀድቋል። ክፍሉ ሞልቷል!' });
          });
        }

        // Notify user via bot
        _notifyUser(ticket.user_id, ticket.telegram_id,
          '✅ ክፍያ ፀድቋል!\n\nቁጥርዎ #' + ticket.number + ' ተረጋግጧል። መልካም እድል! 🍀',
          process.env.FRONTEND_URL || 'http://localhost:5173'
        );
        return res.json({ message: 'ክፍያ ፀድቋል። ትኬት ተረጋግጧል።' });
      });
    })
    .catch(function(err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('[Payments/approve] Error:', err);
      return res.status(500).json({ error: 'Approval failed' });
    });
});

/**
 * POST /api/payments/:id/reject
 * Admin only: Reject a payment
 */
router.post('/:id/reject', auth.requireAdmin, function(req, res) {
  var paymentId = parseInt(req.params.id);
  var adminId   = req.user.id;
  var note      = req.body.note || null;

  db.execute('SELECT * FROM payments WHERE id = ? AND status = "pending"', [paymentId])
    .then(function(results) {
      var payments = results[0];
      if (!payments || payments.length === 0) {
        return Promise.reject({ status: 404, message: 'Payment not found or already reviewed' });
      }

      var payment = payments[0];

      return db.execute(
        'UPDATE payments SET status = "rejected", admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        [note, adminId, paymentId]
      ).then(function() {
        // Reset ticket to allow re-upload
        return db.execute(
          'UPDATE tickets SET status = "pending" WHERE id = ?',
          [payment.ticket_id]
        );
      }).then(function() {
        // Notify user via socket
        if (req.app.get('io')) {
          req.app.get('io').emit('payment:rejected', {
            payment_id: paymentId,
            ticket_id:  payment.ticket_id,
            room_id:    payment.room_id,
            note:       note
          });
        }
        // Notify user via bot
        db.execute('SELECT u.telegram_id FROM users u JOIN tickets t ON t.user_id = u.id WHERE t.id = ?', [payment.ticket_id])
          .then(function(r) {
            if (r[0] && r[0][0]) {
              _notifyUser(payment.user_id, r[0][0].telegram_id,
                '❌ Payment Rejected\n\nYour payment for ticket #' + payment.ticket_id + ' was rejected.' +
                (note ? '\n\nReason: ' + note : '') +
                '\n\nPlease re-upload a clear screenshot of your transfer.',
                process.env.FRONTEND_URL || 'http://localhost:5173'
              );
            }
          }).catch(function() {});
        return res.json({ message: 'Payment rejected' });
      });
    })
    .catch(function(err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('[Payments/reject] Error:', err);
      return res.status(500).json({ error: 'Rejection failed' });
    });
});

/**
 * GET /api/payments/bank-details
 * Public: Get bank details for payment
 */
router.get('/bank-details', function(req, res) {
  return res.json({
    bank_name:       process.env.BANK_NAME           || 'Commercial Bank of Ethiopia',
    account_number:  process.env.BANK_ACCOUNT_NUMBER || '1000123456789',
    account_name:    process.env.BANK_ACCOUNT_NAME   || 'KEBRCHACHA LOTTERY'
  });
});

module.exports = router;
