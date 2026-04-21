'use strict';

var express = require('express');
var router  = express.Router();
var path    = require('path');
var db      = require('../config/db');
var auth    = require('../utils/auth');
var { upload, uploadToCloudinary } = require('../middleware/cloudinary');
require('dotenv').config();

function _notifyUser(userId, telegramId, message, frontendUrl) {
  if (!telegramId || telegramId < 1000) return;
  var bot = null;
  try { bot = require('../bot/index').bot; } catch(e) {}
  if (!bot) return;
  bot.telegram.sendMessage(telegramId, message, {
    reply_markup: { inline_keyboard: [[{ text: '🎮 ከበርቻቻ ክፈት', web_app: { url: frontendUrl } }]] }
  }).catch(function() {});
}

router.post('/upload', auth.requireAuth, function(req, res) {
  // Run multer manually so we can catch its errors and return proper JSON
  upload.single('screenshot')(req, res, function(multerErr) {
    if (multerErr) {
      console.error('[Payments/upload] Multer error:', multerErr.message);
      if (multerErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image too large. Please upload a smaller screenshot (max 15MB).' });
      }
      return res.status(400).json({ error: multerErr.message || 'File upload error' });
    }

    if (!req.file) return res.status(400).json({ error: 'Screenshot image is required' });

    var ticketId = parseInt(req.body.ticket_id);
    var userId   = req.user.id;
    if (!ticketId) return res.status(400).json({ error: 'ticket_id is required' });

    // Generate filename
    var timestamp = Date.now();
    var filename = 'payment_' + userId + '_' + timestamp;

    // Upload to Cloudinary
    uploadToCloudinary(req.file.buffer, filename)
      .then(function(cloudResult) {
        var screenshotUrl = cloudResult.secure_url;

        return db.execute(
          'SELECT t.*, r.entry_fee, r.title AS room_title FROM tickets t JOIN rooms r ON t.room_id = r.id WHERE t.id = ? AND t.user_id = ? AND t.status = ?',
          [ticketId, userId, 'pending']
        ).then(function(results) {
          var tickets = results[0];
          if (!tickets || tickets.length === 0) return Promise.reject({ status: 404, message: 'Ticket not found or not pending' });
          var ticket = tickets[0];
          return db.execute(
            'SELECT id FROM payments WHERE ticket_id = ? AND status IN (?, ?)',
            [ticketId, 'pending', 'approved']
          ).then(function(dupResults) {
            if (dupResults[0] && dupResults[0].length > 0) {
              return Promise.reject({ status: 409, message: 'Payment already submitted for this ticket. Awaiting review.' });
            }
            return db.execute(
              'INSERT INTO payments (ticket_id, user_id, room_id, amount, screenshot_path) VALUES (?, ?, ?, ?, ?)',
              [ticketId, userId, ticket.room_id, ticket.entry_fee, screenshotUrl]
            ).then(function(insertResult) {
              return { ticket: ticket, paymentId: insertResult[0].insertId };
            });
          });
        });
      })
      .then(function(data) {
        if (req.app.get('io')) {
          req.app.get('io').emit('payment:new', {
            payment_id: data.paymentId,
            ticket_id:  ticketId,
            room_id:    data.ticket.room_id,
            username:   req.user.username,
            number:     data.ticket.number
          });
        }
        return res.status(201).json({ message: 'Payment screenshot uploaded. Awaiting admin verification.', payment_id: data.paymentId });
      })
      .catch(function(err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[Payments/upload]', err);
        return res.status(500).json({ error: 'Upload failed. Please try again.' });
      });
  });
});

router.get('/pending', auth.requireAdmin, function(req, res) {
  var sql = 'SELECT p.*, u.username, u.first_name, u.last_name, t.number AS ticket_number, r.title AS room_title FROM payments p JOIN users u ON p.user_id = u.id JOIN tickets t ON p.ticket_id = t.id JOIN rooms r ON p.room_id = r.id WHERE p.status = ? ORDER BY p.created_at ASC';
  db.execute(sql, ['pending'])
    .then(function(results) {
      var payments = results[0].map(function(p) {
        // If screenshot_path is a Cloudinary URL, use it directly
        // If it's a local path (legacy), construct the URL
        if (p.screenshot_path && p.screenshot_path.startsWith('http')) {
          p.screenshot_url = p.screenshot_path;
        } else {
          // Legacy local files
          var normalized = p.screenshot_path.replace(/\\/g, '/');
          var match = normalized.match(/uploads\/payments\/[^/]+$/);
          p.screenshot_url = match ? '/' + match[0] : '/uploads/payments/' + path.basename(normalized);
        }
        return p;
      });
      return res.json({ payments: payments });
    })
    .catch(function(err) { console.error('[Payments/pending]', err); return res.status(500).json({ error: 'Failed to fetch payments' }); });
});

router.post('/:id/approve', auth.requireAdmin, function(req, res) {
  var paymentId = parseInt(req.params.id), adminId = req.user.id;
  db.execute('SELECT * FROM payments WHERE id = ? AND status = ?', [paymentId, 'pending'])
    .then(function(results) {
      var payments = results[0];
      if (!payments || payments.length === 0) return Promise.reject({ status: 404, message: 'Payment not found or already reviewed' });
      var payment = payments[0];
      return db.execute('UPDATE payments SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', ['approved', adminId, paymentId])
        .then(function() { return db.execute('UPDATE tickets SET status = ? WHERE id = ?', ['verified', payment.ticket_id]); })
        .then(function() { return payment; });
    })
    .then(function(payment) {
      return db.execute('UPDATE rooms SET filled_slots = filled_slots + 1 WHERE id = ?', [payment.room_id])
        .then(function() { return db.execute('SELECT * FROM rooms WHERE id = ?', [payment.room_id]); })
        .then(function(results) { return { payment: payment, room: results[0][0] }; });
    })
    .then(function(data) {
      var room = data.room, payment = data.payment;
      return db.execute('SELECT t.*, u.username, u.first_name, u.last_name, u.telegram_id FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.id = ?', [payment.ticket_id])
        .then(function(results) {
          var ticket = results[0][0];
          if (req.app.get('io')) {
            req.app.get('io').emit('ticket:verified', { room_id: payment.room_id, ticket_id: payment.ticket_id, number: ticket.number, username: ticket.username, first_name: ticket.first_name, last_name: ticket.last_name, status: 'taken' });
            if (room.filled_slots >= room.total_slots) req.app.get('io').emit('room:locked', { room_id: room.id });
          }
          if (room.filled_slots >= room.total_slots) {
            return db.execute('UPDATE rooms SET status = ? WHERE id = ?', ['locked', room.id]).then(function() {
              _notifyUser(ticket.user_id, ticket.telegram_id, '✅ ክፍያ ፀድቋል!\n\nቁጥርዎ #' + ticket.number + ' ተረጋግጧል።\n\n🔒 ክፍሉ ሞልቷል! ዕጣ ብዙም ሳይቆይ ይጀምራል። መልካም እድል! 🍀', process.env.FRONTEND_URL || 'http://localhost:5173');
              return res.json({ message: 'ክፍያ ፀድቋል። ክፍሉ ሞልቷል!' });
            });
          }
          _notifyUser(ticket.user_id, ticket.telegram_id, '✅ ክፍያ ፀድቋል!\n\nቁጥርዎ #' + ticket.number + ' ተረጋግጧል። መልካም እድል! 🍀', process.env.FRONTEND_URL || 'http://localhost:5173');
          return res.json({ message: 'ክፍያ ፀድቋል። ትኬት ተረጋግጧል።' });
        });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Payments/approve]', err);
      return res.status(500).json({ error: 'Approval failed' });
    });
});

router.post('/:id/reject', auth.requireAdmin, function(req, res) {
  var paymentId = parseInt(req.params.id), adminId = req.user.id, note = req.body.note || null;
  db.execute('SELECT p.*, t.number, t.room_id FROM payments p JOIN tickets t ON p.ticket_id = t.id WHERE p.id = ? AND p.status = ?', [paymentId, 'pending'])
    .then(function(results) {
      var payments = results[0];
      if (!payments || payments.length === 0) return Promise.reject({ status: 404, message: 'Payment not found or already reviewed' });
      var payment = payments[0];
      
      // Reject payment and DELETE the ticket to free up the number
      return db.execute('UPDATE payments SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', ['rejected', note, adminId, paymentId])
        .then(function() { 
          // Delete the ticket entirely so the number becomes available again
          return db.execute('DELETE FROM tickets WHERE id = ?', [payment.ticket_id]); 
        })
        .then(function() {
          // Emit socket events
          if (req.app.get('io')) {
            req.app.get('io').to('room:' + payment.room_id).emit('payment:rejected', { 
              payment_id: paymentId, 
              ticket_id: payment.ticket_id, 
              room_id: payment.room_id, 
              note: note 
            });
            // Notify that the number is now available
            req.app.get('io').to('room:' + payment.room_id).emit('ticket:released', { 
              room_id: payment.room_id, 
              number: payment.number,
              status: 'available' 
            });
          }
          
          // Notify user via Telegram
          db.execute('SELECT u.telegram_id FROM users u WHERE u.id = ?', [payment.user_id])
            .then(function(r) {
              if (r[0] && r[0][0]) {
                _notifyUser(payment.user_id, r[0][0].telegram_id, 
                  '❌ ክፍያ ውድቅ ሆኗል\n\n' + 
                  'ቁጥር #' + payment.number + ' ተለቋል።\n\n' +
                  (note ? 'ምክንያት: ' + note + '\n\n' : '') + 
                  'እባክዎ ግልጽ የሆነ የዝውውር ቅጽበታዊ ምስል በመላክ እንደገና ይሞክሩ።', 
                  process.env.FRONTEND_URL || 'http://localhost:5173'
                );
              }
            }).catch(function() {});
          
          return res.json({ message: 'Payment rejected and number released' });
        });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Payments/reject]', err);
      return res.status(500).json({ error: 'Rejection failed' });
    });
});

router.get('/bank-details', function(req, res) {
  return res.json({ 
    bank_name: process.env.BANK_NAME || 'Commercial Bank of Ethiopia', 
    account_number: process.env.BANK_ACCOUNT_NUMBER || '1000296475387', 
    account_name: process.env.BANK_ACCOUNT_NAME || 'Tesfamikael Worku',
    telebirr_name: process.env.TELEBIRR_NAME || 'Tesfamichael',
    telebirr_number: process.env.TELEBIRR_NUMBER || '0946336242'
  });
});

// Admin: Get stuck tickets (pending without payment - instant for testing)
router.get('/stuck-tickets', auth.requireAdmin, function(req, res) {
  var sql = [
    'SELECT t.*, u.username, u.first_name, r.title AS room_title,',
    'TIMESTAMPDIFF(MINUTE, t.created_at, NOW()) AS minutes_held',
    'FROM tickets t',
    'JOIN users u ON t.user_id = u.id',
    'JOIN rooms r ON t.room_id = r.id',
    'WHERE t.status = ?',
    'ORDER BY t.created_at ASC'
  ].join(' ');
  
  db.execute(sql, ['pending'])
    .then(function(results) {
      return res.json({ stuck_tickets: results[0] });
    })
    .catch(function(err) {
      console.error('[Payments/stuck-tickets]', err);
      return res.status(500).json({ error: 'Failed to fetch stuck tickets' });
    });
});

// Admin: Force release a stuck ticket
router.post('/tickets/:id/force-release', auth.requireAdmin, function(req, res) {
  var ticketId = parseInt(req.params.id);
  
  db.execute('SELECT t.*, r.title AS room_title FROM tickets t JOIN rooms r ON t.room_id = r.id WHERE t.id = ?', [ticketId])
    .then(function(results) {
      var tickets = results[0];
      if (!tickets || tickets.length === 0) {
        return Promise.reject({ status: 404, message: 'Ticket not found' });
      }
      var ticket = tickets[0];
      
      // Delete the ticket to free the number
      return db.execute('DELETE FROM tickets WHERE id = ?', [ticketId])
        .then(function() {
          // Also delete any pending payments for this ticket
          return db.execute('DELETE FROM payments WHERE ticket_id = ? AND status = ?', [ticketId, 'pending']);
        })
        .then(function() {
          // Emit socket event
          if (req.app.get('io')) {
            req.app.get('io').to('room:' + ticket.room_id).emit('ticket:released', {
              room_id: ticket.room_id,
              number: ticket.number,
              status: 'available'
            });
          }
          
          // Notify user
          db.execute('SELECT telegram_id FROM users WHERE id = ?', [ticket.user_id])
            .then(function(r) {
              if (r[0] && r[0][0]) {
                _notifyUser(ticket.user_id, r[0][0].telegram_id,
                  '⏰ ቁጥር #' + ticket.number + ' ተለቋል\n\n' +
                  'ክፍያዎን በጊዜ ስላልፈጸሙ ቁጥሩ ለሌሎች ተለቋል። እባክዎ እንደገና ይሞክሩ።',
                  process.env.FRONTEND_URL || 'http://localhost:5173'
                );
              }
            }).catch(function() {});
          
          return res.json({ 
            message: 'Ticket released successfully', 
            number: ticket.number,
            room_title: ticket.room_title
          });
        });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Payments/force-release]', err);
      return res.status(500).json({ error: 'Failed to release ticket' });
    });
});

module.exports = router;
