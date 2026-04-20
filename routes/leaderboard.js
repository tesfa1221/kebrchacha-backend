'use strict';

var express = require('express');
var router  = express.Router();
var db      = require('../config/db');
var auth    = require('../utils/auth');

/**
 * GET /api/leaderboard
 * Top winners by total ETB won
 */
router.get('/', auth.requireAuth, function(req, res) {
  var sql = [
    'SELECT u.id, u.username, u.first_name, u.last_name,',
    '  COUNT(w.id)   AS total_wins,',
    '  SUM(w.prize)  AS total_prize,',
    '  MAX(w.place = 1) AS has_first,',
    '  SUM(w.place = 1) AS first_place_wins,',
    '  SUM(w.place = 2) AS second_place_wins,',
    '  SUM(w.place = 3) AS third_place_wins',
    'FROM winners w',
    'JOIN users u ON w.user_id = u.id',
    'GROUP BY u.id',
    'ORDER BY total_prize DESC, total_wins DESC',
    'LIMIT 20'
  ].join(' ');

  db.execute(sql)
    .then(function(results) {
      return res.json({ leaderboard: results[0] });
    })
    .catch(function(err) {
      console.error('[Leaderboard] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    });
});

module.exports = router;
