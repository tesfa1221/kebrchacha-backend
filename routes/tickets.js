'use strict';

var express = require('express');
var router  = express.Router();
var db      = require('../config/db');
var auth    = require('../utils/auth');

/**
 * POST /api/tickets/reserve
 * Reserve a number in a room (creates pending ticket)
 */
router.post('/reserve', auth.requireAuth, function(req, res) {
  var roomId = parseInt(req.body.room_id);
  var number = parseInt(req.body.number);
  var userId = req.user.id;

  if (!roomId || !number || number < 1) {
    return res.status(400).json({ error: 'Valid room_id and number are required' });
  }

  // Check room is active and get total_slots
  db.execute('SELECT * FROM rooms WHERE id = ? AND status = "active"', [roomId])
    .then(function(results) {
      var rooms = results[0];
      if (!rooms || rooms.length === 0) {
        return Promise.reject({ status: 400, message: 'Room is not active' });
      }
      var room = rooms[0];
      if (number > room.total_slots) {
        return Promise.reject({ status: 400, message: 'Number exceeds room slots (max ' + room.total_slots + ')' });
      }

      // Check number is not already taken or pending
      return db.execute(
        'SELECT * FROM tickets WHERE room_id = ? AND number = ?',
        [roomId, number]
      );
    })
    .then(function(results) {
      var existing = results[0];
      if (existing && existing.length > 0) {
        return Promise.reject({ status: 409, message: 'Number already reserved or taken' });
      }

      // Check user doesn't already have a pending ticket in this room
      return db.execute(
        'SELECT * FROM tickets WHERE room_id = ? AND user_id = ? AND status = "pending"',
        [roomId, userId]
      );
    })
    .then(function(results) {
      var pending = results[0];
      if (pending && pending.length > 0) {
        return Promise.reject({ status: 409, message: 'You already have a pending ticket in this room. Please complete payment first.' });
      }

      // Create the ticket
      return db.execute(
        'INSERT INTO tickets (room_id, user_id, number, status) VALUES (?, ?, ?, "pending")',
        [roomId, userId, number]
      );
    })
    .then(function(results) {
      var ticketId = results[0].insertId;

      // Emit socket event: number is now 'pending' (yellow)
      if (req.app.get('io')) {
        req.app.get('io').to('room:' + roomId).emit('ticket:reserved', {
          room_id:  roomId,
          number:   number,
          status:   'pending',
          username: req.user.username,
          ticket_id: ticketId
        });
      }

      return res.status(201).json({
        message:   'Number reserved. Please upload payment screenshot.',
        ticket_id: ticketId,
        number:    number
      });
    })
    .catch(function(err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('[Tickets/reserve] Error:', err);
      return res.status(500).json({ error: 'Reservation failed' });
    });
});

/**
 * GET /api/tickets/my
 * Get all tickets for the current user
 */
router.get('/my', auth.requireAuth, function(req, res) {
  var sql = [
    'SELECT t.*, r.title AS room_title, r.entry_fee, r.status AS room_status',
    'FROM tickets t',
    'JOIN rooms r ON t.room_id = r.id',
    'WHERE t.user_id = ?',
    'ORDER BY t.created_at DESC'
  ].join(' ');

  db.execute(sql, [req.user.id])
    .then(function(results) {
      return res.json({ tickets: results[0] });
    })
    .catch(function(err) {
      console.error('[Tickets/my] Error:', err);
      return res.status(500).json({ error: 'Failed to fetch tickets' });
    });
});

/**
 * DELETE /api/tickets/:id
 * Cancel a pending ticket (user can cancel before payment)
 */
router.delete('/:id', auth.requireAuth, function(req, res) {
  var ticketId = parseInt(req.params.id);
  var userId   = req.user.id;

  db.execute(
    'DELETE FROM tickets WHERE id = ? AND user_id = ? AND status = "pending"',
    [ticketId, userId]
  )
    .then(function(results) {
      if (results[0].affectedRows === 0) {
        return res.status(404).json({ error: 'Ticket not found or cannot be cancelled' });
      }

      // Emit socket event: number is available again
      if (req.app.get('io')) {
        req.app.get('io').emit('ticket:cancelled', { ticket_id: ticketId });
      }

      return res.json({ message: 'Ticket cancelled' });
    })
    .catch(function(err) {
      console.error('[Tickets/cancel] Error:', err);
      return res.status(500).json({ error: 'Failed to cancel ticket' });
    });
});

module.exports = router;
