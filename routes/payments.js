'use strict';

var express = require('express');
var router  = express.Router();
var path    = require('path');
var db      = require('../config/db');
var auth    = require('../utils/auth');
var upload  = require('../middleware/upload');
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

router.post('/upload', auth.requireAuth, upload.single('screenshot'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Screenshot image is required' });
  var ticketId = parseInt(req.body.ticket_id), userId = req.user.id;
  if (!ticketId) return res.status(400).json({ error: 'ticket_id is required' });

  db.execute('SELECT t.*, r.entry_fee, r.title AS room_title FROM tickets t JOIN rooms r ON t.room_id = r.id WHERE t.id = ? AND t.user_id = ? AND t.status = ?', [ticketId, userId, 'pending'])
    .then(function(results) {
      var tickets = results[0];
      if (!tickets || tickets.length === 0) return Promise.reject({ status: 404, message: 'Ticket not found or not pending' });
      var ticket = tickets[0];
      return db.execute('SELECT id FROM payments WHERE ticket_id = ? AND status IN (?, ?)', [ticketId, 'pending', 'approved'])
        .then(function(dupResults) {
          if (dupResults[0] && dupResults[0].length > 0) return Promise.reject({ status: 409, message: 'Payment already submitted for this ticket. Awaiting review.' });
          return db.execute('INSERT INTO payments (ticket_id, user_id, room_id, amount, screenshot_path) VALUES (?, ?, ?, ?, ?)', [ticketId, userId, ticket.room_id, ticket.entry_fee, req.file.path])
            .then(function(insertResult) { return { ticket: ticket, paymentId: insertResult[0].insertId }; });
        });
    })
    .then(function(data) {
      if (req.app.get('io')) req.app.get('io').emit('payment:new', { payment_id: data.paymentId, ticket_id: ticketId, room_id: data.ticket.room_id, username: req.user.username, number: data.ticket.number });
      return res.status(201).json({ message: 'Payment screenshot uploaded. Awaiting admin verification.', payment_id: data.paymentId });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Payments/upload]', err);
      return res.status(500).json({ error: 'Upload failed' });
    });
});

router.get('/pending', auth.requireAdmin, function(req, res) {
  var sql = 'SELECT p.*, u.username, u.first_name, u.last_name, t.number AS ticket_number, r.title AS room_title FROM payments p JOIN users u ON p.user_id = u.id JOIN tickets t ON p.ticket_id = t.id JOIN rooms r ON p.room_id = r.id WHERE p.status = ? ORDER BY p.created_at ASC';
  db.execute(sql, ['pending'])
    .then(function(results) {
      var payments = results[0].map(function(p) {
        p.screenshot_url = '/uploads/' + path.basename(path.dirname(p.screenshot_path)) + '/' + path.basename(p.screenshot_path);
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
  db.execute('SELECT * FROM payments WHERE id = ? AND status = ?', [paymentId, 'pending'])
    .then(function(results) {
      var payments = results[0];
      if (!payments || payments.length === 0) return Promise.reject({ status: 404, message: 'Payment not found or already reviewed' });
      var payment = payments[0];
      return db.execute('UPDATE payments SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', ['rejected', note, adminId, paymentId])
        .then(function() { return db.execute('UPDATE tickets SET status = ? WHERE id = ?', ['pending', payment.ticket_id]); })
        .then(function() {
          if (req.app.get('io')) req.app.get('io').emit('payment:rejected', { payment_id: paymentId, ticket_id: payment.ticket_id, room_id: payment.room_id, note: note });
          db.execute('SELECT u.telegram_id FROM users u JOIN tickets t ON t.user_id = u.id WHERE t.id = ?', [payment.ticket_id])
            .then(function(r) {
              if (r[0] && r[0][0]) _notifyUser(payment.user_id, r[0][0].telegram_id, '❌ ክፍያ ውድቅ ሆኗል\n\n' + (note ? 'ምክንያት: ' + note + '\n\n' : '') + 'እባክዎ ግልጽ የሆነ የዝውውር ቅጽበታዊ ምስል እንደገና ይጫኑ።', process.env.FRONTEND_URL || 'http://localhost:5173');
            }).catch(function() {});
          return res.json({ message: 'Payment rejected' });
        });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Payments/reject]', err);
      return res.status(500).json({ error: 'Rejection failed' });
    });
});

router.get('/bank-details', function(req, res) {
  return res.json({ bank_name: process.env.BANK_NAME || 'Commercial Bank of Ethiopia', account_number: process.env.BANK_ACCOUNT_NUMBER || '1000123456789', account_name: process.env.BANK_ACCOUNT_NAME || 'KEBRCHACHA LOTTERY' });
});

module.exports = router;
