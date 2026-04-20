'use strict';

var express = require('express');
var router  = express.Router();
var db      = require('../config/db');
var auth    = require('../utils/auth');

/**
 * POST /api/notify/new-room
 * Admin: Broadcast new room to all users via Telegram bot
 */
router.post('/new-room', auth.requireAdmin, function(req, res) {
  var roomId = parseInt(req.body.room_id);
  if (!roomId) return res.status(400).json({ error: 'room_id required' });

  var bot         = null;
  var FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  try { bot = require('../bot/index').bot; } catch(e) {}
  if (!bot) return res.status(500).json({ error: 'Bot not available' });

  db.execute('SELECT * FROM rooms WHERE id = ?', [roomId])
    .then(function(results) {
      var room = results[0][0];
      if (!room) return Promise.reject({ status: 404, message: 'Room not found' });

      return db.execute('SELECT telegram_id FROM users WHERE is_admin = 0 AND telegram_id > 1000');
    })
    .then(function(results) {
      var users = results[0];
      var sent  = 0;

      users.forEach(function(u) {
        bot.telegram.sendMessage(u.telegram_id, [
          '🎰 *New KEBRCHACHA Room Open!*',
          '',
          '🏠 ' + req.body.title,
          '💰 Entry: ' + req.body.entry_fee + ' ETB',
          '🥇 ' + req.body.prize_1st + ' | 🥈 ' + req.body.prize_2nd + ' | 🥉 ' + req.body.prize_3rd + ' ETB',
          '',
          '50 slots available — grab yours now!'
        ].join('\n'), {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🎮 Join Now', web_app: { url: FRONTEND_URL } }
            ]]
          }
        }).then(function() { sent++; }).catch(function() {});
      });

      return res.json({ message: 'Notifications sent to ' + users.length + ' users' });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Notify] Error:', err);
      return res.status(500).json({ error: 'Failed to send notifications' });
    });
});

module.exports = router;
