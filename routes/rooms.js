'use strict';

var express    = require('express');
var router     = express.Router();
var db         = require('../config/db');
var auth       = require('../utils/auth');
var randomizer = require('../utils/randomizer');

router.get('/', auth.requireAuth, function(req, res) {
  var sql = 'SELECT r.*, u.username AS creator_username, u.first_name AS creator_first_name FROM rooms r JOIN users u ON r.created_by = u.id WHERE r.status IN (?, ?) ORDER BY r.created_at DESC';
  db.execute(sql, ['active', 'locked'])
    .then(function(results) { return res.json({ rooms: results[0] }); })
    .catch(function(err) { console.error('[Rooms/list]', err); return res.status(500).json({ error: 'Failed to fetch rooms' }); });
});

router.get('/:id', auth.requireAuth, function(req, res) {
  var roomId = parseInt(req.params.id);
  var roomSql = 'SELECT r.*, u.username AS creator_username FROM rooms r JOIN users u ON r.created_by = u.id WHERE r.id = ?';
  var ticketSql = 'SELECT t.*, u.username, u.first_name, u.last_name FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.room_id = ?';
  Promise.all([db.execute(roomSql, [roomId]), db.execute(ticketSql, [roomId])])
    .then(function(results) {
      var rooms = results[0][0]; var tickets = results[1][0];
      if (!rooms || rooms.length === 0) return res.status(404).json({ error: 'Room not found' });
      var room = rooms[0];
      var grid = {};
      for (var i = 1; i <= room.total_slots; i++) grid[i] = { number: i, status: 'available', username: null, first_name: null };
      tickets.forEach(function(ticket) {
        grid[ticket.number] = { number: ticket.number, status: ticket.status === 'verified' ? 'taken' : 'pending', username: ticket.username, first_name: ticket.first_name, last_name: ticket.last_name, ticket_id: ticket.id, is_mine: ticket.user_id === req.user.id };
      });
      room.grid = Object.values(grid);
      return res.json({ room: room });
    })
    .catch(function(err) { console.error('[Rooms/get]', err); return res.status(500).json({ error: 'Failed to fetch room' }); });
});

router.post('/', auth.requireAdmin, function(req, res) {
  var title = req.body.title, entryFee = parseFloat(req.body.entry_fee), prize1st = parseFloat(req.body.prize_1st), prize2nd = parseFloat(req.body.prize_2nd), prize3rd = parseFloat(req.body.prize_3rd), totalSlots = parseInt(req.body.total_slots) || 50;
  if (!title || isNaN(entryFee) || isNaN(prize1st) || isNaN(prize2nd) || isNaN(prize3rd)) return res.status(400).json({ error: 'title, entry_fee, prize_1st, prize_2nd, prize_3rd are required' });
  if (totalSlots < 5 || totalSlots > 500) return res.status(400).json({ error: 'total_slots must be between 5 and 500' });
  db.execute('INSERT INTO rooms (title, entry_fee, prize_1st, prize_2nd, prize_3rd, total_slots, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', [title, entryFee, prize1st, prize2nd, prize3rd, totalSlots, req.user.id])
    .then(function(results) { return db.execute('SELECT * FROM rooms WHERE id = ?', [results[0].insertId]); })
    .then(function(results) {
      var room = results[0][0];
      if (req.app.get('io')) req.app.get('io').emit('room:created', { room: room });
      return res.status(201).json({ room: room });
    })
    .catch(function(err) { console.error('[Rooms/create]', err); return res.status(500).json({ error: 'Failed to create room' }); });
});

router.delete('/:id', auth.requireAdmin, function(req, res) {
  var roomId = parseInt(req.params.id);
  db.execute('UPDATE rooms SET status = ? WHERE id = ? AND status = ?', ['cancelled', roomId, 'active'])
    .then(function(results) {
      if (results[0].affectedRows === 0) return res.status(404).json({ error: 'Room not found or already locked/completed' });
      if (req.app.get('io')) req.app.get('io').emit('room:cancelled', { room_id: roomId });
      return res.json({ message: 'Room cancelled' });
    })
    .catch(function(err) { console.error('[Rooms/cancel]', err); return res.status(500).json({ error: 'Failed to cancel room' }); });
});

router.post('/:id/draw', auth.requireAdmin, function(req, res) {
  var roomId = parseInt(req.params.id);
  db.execute('SELECT * FROM rooms WHERE id = ? AND status = ?', [roomId, 'locked'])
    .then(function(results) {
      if (!results[0] || results[0].length === 0) return Promise.reject({ status: 400, message: 'Room is not locked or does not exist' });
      return db.execute('SELECT t.*, u.username, u.first_name FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.room_id = ? AND t.status = ?', [roomId, 'verified']);
    })
    .then(function(results) {
      var tickets = results[0];
      if (tickets.length < 3) return Promise.reject({ status: 400, message: 'Not enough verified tickets to draw' });
      var winners = randomizer.selectWinners(tickets, 3);
      return db.execute('SELECT * FROM rooms WHERE id = ?', [roomId])
        .then(function(r) {
          var room = r[0][0];
          var insertPromises = winners.map(function(winner, index) {
            var place = index + 1;
            var prize = place === 1 ? room.prize_1st : (place === 2 ? room.prize_2nd : room.prize_3rd);
            return db.execute('INSERT INTO winners (room_id, user_id, ticket_id, place, prize) VALUES (?, ?, ?, ?, ?)', [roomId, winner.user_id, winner.id, place, prize]);
          });
          return Promise.all(insertPromises).then(function() { return { winners: winners, room: room }; });
        })
        .then(function(data) {
          return db.execute('UPDATE rooms SET status = ?, draw_at = NOW(), winner_1st = ?, winner_2nd = ?, winner_3rd = ? WHERE id = ?',
            ['completed', data.winners[0].user_id, data.winners[1].user_id, data.winners[2].user_id, roomId])
            .then(function() { return data.winners; });
        });
    })
    .then(function(winners) {
      var payload = { room_id: roomId, winners: winners.map(function(w, i) { return { place: i+1, username: w.username, first_name: w.first_name, number: w.number }; }) };
      if (req.app.get('io')) req.app.get('io').emit('room:winners', payload);
      var bot = null; try { bot = require('../bot/index').bot; } catch(e) {}
      if (bot) {
        db.execute('SELECT DISTINCT u.telegram_id FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.room_id = ?', [roomId])
          .then(function(r) {
            var msg = ['🎰 ከበርቻቻ — የዕጣ ውጤቶች!', '', '🥇 1ኛ: ' + (payload.winners[0] ? payload.winners[0].first_name + ' (#' + payload.winners[0].number + ')' : '—'), '🥈 2ኛ: ' + (payload.winners[1] ? payload.winners[1].first_name + ' (#' + payload.winners[1].number + ')' : '—'), '🥉 3ኛ: ' + (payload.winners[2] ? payload.winners[2].first_name + ' (#' + payload.winners[2].number + ')' : '—'), '', '🎉 ለሁሉም አሸናፊዎች እንኳን ደስ አለዎት!'].join('\n');
            r[0].forEach(function(u) {
              if (!u.telegram_id || u.telegram_id < 1000) return;
              bot.telegram.sendMessage(u.telegram_id, msg, { reply_markup: { inline_keyboard: [[{ text: '🏆 አሸናፊዎችን ይመልከቱ', web_app: { url: (process.env.FRONTEND_URL || 'http://localhost:5173') + '/winners/' + roomId } }]] } }).catch(function() {});
            });
          }).catch(function() {});
      }
      return res.json({ message: 'Draw completed', winners: payload.winners });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Rooms/draw]', err);
      return res.status(500).json({ error: 'Draw failed' });
    });
});

module.exports = router;
