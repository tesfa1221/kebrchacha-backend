'use strict';

var express = require('express');
var router  = express.Router();
var db      = require('../config/db');
var auth    = require('../utils/auth');

/**
 * GET /api/rooms/:id/winners
 * Get winners for a completed room
 */
router.get('/:id/winners', auth.requireAuth, function(req, res) {
  var roomId = parseInt(req.params.id);

  var sql = [
    'SELECT w.place, w.prize,',
    '  u.username, u.first_name, u.last_name,',
    '  t.number',
    'FROM winners w',
    'JOIN users u   ON w.user_id   = u.id',
    'JOIN tickets t ON w.ticket_id = t.id',
    'WHERE w.room_id = ?',
    'ORDER BY w.place ASC'
  ].join(' ');

  db.execute(sql, [roomId])
    .then(function(results) {
      return res.json({ winners: results[0] });
    })
    .catch(function(err) {
      console.error('[Winners] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch winners' });
    });
});

module.exports = router;
