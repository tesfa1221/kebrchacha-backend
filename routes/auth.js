'use strict';

var express = require('express');
var router  = express.Router();
var db      = require('../config/db');
var auth    = require('../utils/auth');
require('dotenv').config();

/**
 * POST /api/auth/telegram
 * Authenticate via Telegram WebApp initData
 * Creates user if not exists, returns JWT
 */
router.post('/telegram', function(req, res) {
  var telegramId = req.body.telegram_id;
  var username   = req.body.username   || null;
  var firstName  = req.body.first_name || null;
  var lastName   = req.body.last_name  || null;

  if (!telegramId) {
    return res.status(400).json({ error: 'telegram_id is required' });
  }

  var adminTelegramId = parseInt(process.env.ADMIN_TELEGRAM_ID) || 0;
  var isAdmin = (parseInt(telegramId) === adminTelegramId) ? 1 : 0;

  var sql = [
    'INSERT INTO users (telegram_id, username, first_name, last_name, is_admin)',
    'VALUES (?, ?, ?, ?, ?)',
    'ON DUPLICATE KEY UPDATE',
    '  username   = VALUES(username),',
    '  first_name = VALUES(first_name),',
    '  last_name  = VALUES(last_name),',
    '  is_admin   = IF(is_admin = 1, 1, VALUES(is_admin))'
  ].join(' ');

  db.execute(sql, [telegramId, username, firstName, lastName, isAdmin])
    .then(function() {
      return db.execute('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
    })
    .then(function(results) {
      var rows = results[0];
      if (!rows || rows.length === 0) {
        return res.status(500).json({ error: 'User creation failed' });
      }
      var user  = rows[0];
      var token = auth.generateToken(user);
      return res.json({ token: token, user: user });
    })
    .catch(function(err) {
      console.error('[Auth] Error:', err);
      return res.status(500).json({ error: 'Authentication failed' });
    });
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', auth.requireAuth, function(req, res) {
  db.execute('SELECT * FROM users WHERE id = ?', [req.user.id])
    .then(function(results) {
      var rows = results[0];
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ user: rows[0] });
    })
    .catch(function(err) {
      console.error('[Auth/me] Error:', err);
      return res.status(500).json({ error: 'Server error' });
    });
});

module.exports = router;
