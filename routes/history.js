'use strict';

var express = require('express');
var router  = express.Router();
var db      = require('../config/db');
var auth    = require('../utils/auth');

/**
 * GET /api/history
 * Public: All completed rooms with their winners
 */
router.get('/', auth.requireAuth, function(req, res) {
  var roomsSql = [
    'SELECT r.id, r.title, r.entry_fee, r.prize_1st, r.prize_2nd, r.prize_3rd,',
    '  r.total_slots, r.filled_slots, r.draw_at, r.created_at',
    'FROM rooms r',
    'WHERE r.status = ?',
    'ORDER BY r.draw_at DESC',
    'LIMIT 50'
  ].join(' ');

  var winnersSql = [
    'SELECT w.room_id, w.place, w.prize,',
    '  u.username, u.first_name, u.last_name,',
    '  t.number',
    'FROM winners w',
    'JOIN users u   ON w.user_id   = u.id',
    'JOIN tickets t ON w.ticket_id = t.id',
    'ORDER BY w.room_id DESC, w.place ASC'
  ].join(' ');

  Promise.all([
    db.execute(roomsSql, ['completed']),
    db.execute(winnersSql)
  ])
    .then(function(results) {
      var rooms   = results[0][0];
      var winners = results[1][0];

      // Group winners by room_id
      var winnerMap = {};
      winners.forEach(function(w) {
        if (!winnerMap[w.room_id]) winnerMap[w.room_id] = [];
        winnerMap[w.room_id].push(w);
      });

      var history = rooms.map(function(room) {
        return Object.assign({}, room, { winners: winnerMap[room.id] || [] });
      });

      return res.json({ history: history });
    })
    .catch(function(err) {
      console.error('[History] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch history' });
    });
});

module.exports = router;
