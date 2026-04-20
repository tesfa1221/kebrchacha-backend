'use strict';

var express  = require('express');
var router   = express.Router();
var bcrypt   = require('bcryptjs');
var auth     = require('../utils/auth');
var db       = require('../config/db');
require('dotenv').config();

var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/**
 * POST /api/admin/login
 * Direct browser login for admin portal
 */
router.post('/login', function(req, res) {
  var password = req.body.password;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Fetch the admin user from DB
  db.execute('SELECT * FROM users WHERE is_admin = 1 LIMIT 1')
    .then(function(results) {
      var users = results[0];
      if (!users || users.length === 0) {
        return res.status(404).json({ error: 'Admin user not found in database' });
      }
      var user  = users[0];
      var token = auth.generateToken(user);
      return res.json({ token: token, user: user });
    })
    .catch(function(err) {
      console.error('[AdminAuth] Error:', err);
      return res.status(500).json({ error: 'Login failed' });
    });
});

/**
 * GET /api/admin/rooms
 * Admin: All rooms with all statuses
 */
router.get('/rooms', function(req, res) {
  var token = (req.headers['authorization'] || '').split(' ')[1];
  var auth  = require('../utils/auth');
  var decoded = auth.verifyToken(token);
  if (!decoded || !decoded.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  var db = require('../config/db');
  db.execute([
    'SELECT r.*, u.username AS creator_username',
    'FROM rooms r JOIN users u ON r.created_by = u.id',
    'ORDER BY r.created_at DESC'
  ].join(' '))
    .then(function(results) {
      return res.json({ rooms: results[0] });
    })
    .catch(function(err) {
      return res.status(500).json({ error: 'Failed to fetch rooms' });
    });
});

module.exports = router;
