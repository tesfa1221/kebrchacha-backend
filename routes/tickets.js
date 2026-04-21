'use strict';

var express = require('express');
var router  = express.Router();
var db      = require('../config/db');
var auth    = require('../utils/auth');

router.post('/reserve', auth.requireAuth, function(req, res) {
  var roomId = parseInt(req.body.room_id), number = parseInt(req.body.number), userId = req.user.id;
  if (!roomId || !number || number < 1) return res.status(400).json({ error: 'Valid room_id and number are required' });

  db.execute('SELECT * FROM rooms WHERE id = ? AND status = ?', [roomId, 'active'])
    .then(function(results) {
      var rooms = results[0];
      if (!rooms || rooms.length === 0) return Promise.reject({ status: 400, message: 'Room is not active' });
      var room = rooms[0];
      if (number > room.total_slots) return Promise.reject({ status: 400, message: 'Number exceeds room slots (max ' + room.total_slots + ')' });
      return db.execute('SELECT * FROM tickets WHERE room_id = ? AND number = ?', [roomId, number]);
    })
    .then(function(results) {
      if (results[0] && results[0].length > 0) return Promise.reject({ status: 409, message: 'Number already reserved or taken' });
      return db.execute('SELECT * FROM tickets WHERE room_id = ? AND user_id = ? AND status = ?', [roomId, userId, 'pending']);
    })
    .then(function(results) {
      if (results[0] && results[0].length > 0) return Promise.reject({ status: 409, message: 'You already have a pending ticket in this room. Please complete payment first.' });
      return db.execute('INSERT INTO tickets (room_id, user_id, number, status) VALUES (?, ?, ?, ?)', [roomId, userId, number, 'pending']);
    })
    .then(function(results) {
      var ticketId = results[0].insertId;
      if (req.app.get('io')) req.app.get('io').to('room:' + roomId).emit('ticket:reserved', { room_id: roomId, number: number, status: 'pending', username: req.user.username, ticket_id: ticketId });
      return res.status(201).json({ message: 'Number reserved. Please upload payment screenshot.', ticket_id: ticketId, number: number });
    })
    .catch(function(err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[Tickets/reserve]', err);
      return res.status(500).json({ error: 'Reservation failed' });
    });
});

router.get('/my', auth.requireAuth, function(req, res) {
  db.execute('SELECT t.*, r.title AS room_title, r.entry_fee, r.status AS room_status, r.id AS room_id FROM tickets t JOIN rooms r ON t.room_id = r.id WHERE t.user_id = ? ORDER BY t.created_at DESC', [req.user.id])
    .then(function(results) { return res.json({ tickets: results[0] }); })
    .catch(function(err) { console.error('[Tickets/my]', err); return res.status(500).json({ error: 'Failed to fetch tickets' }); });
});

router.delete('/:id', auth.requireAuth, function(req, res) {
  var ticketId = parseInt(req.params.id), userId = req.user.id;
  db.execute('DELETE FROM tickets WHERE id = ? AND user_id = ? AND status = ?', [ticketId, userId, 'pending'])
    .then(function(results) {
      if (results[0].affectedRows === 0) return res.status(404).json({ error: 'Ticket not found or cannot be cancelled' });
      if (req.app.get('io')) req.app.get('io').emit('ticket:cancelled', { ticket_id: ticketId });
      return res.json({ message: 'Ticket cancelled' });
    })
    .catch(function(err) { console.error('[Tickets/cancel]', err); return res.status(500).json({ error: 'Failed to cancel ticket' }); });
});

module.exports = router;
