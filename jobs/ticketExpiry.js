'use strict';

var cron = require('node-cron');
var db   = require('../config/db');

/**
 * Cron job: Release pending tickets older than 30 minutes
 * Runs every 5 minutes
 */
function startTicketExpiryJob(io) {
  cron.schedule('*/5 * * * *', function() {
    var sql = [
      'SELECT t.id, t.room_id, t.number, t.user_id',
      'FROM tickets t',
      'LEFT JOIN payments p ON p.ticket_id = t.id AND p.status = ?',
      'WHERE t.status = ?',
      '  AND t.created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)',
      '  AND p.id IS NULL'
    ].join(' ');

    db.execute(sql, ['pending', 'pending'])
      .then(function(results) {
        var expired = results[0];
        if (!expired || expired.length === 0) return;

        console.log('[Cron] Releasing ' + expired.length + ' expired pending ticket(s)');

        var ids = expired.map(function(t) { return t.id; });
        var placeholders = ids.map(function() { return '?'; }).join(',');

        return db.execute(
          'DELETE FROM tickets WHERE id IN (' + placeholders + ')',
          ids
        ).then(function() {
          // Broadcast each released number back to available
          if (io) {
            expired.forEach(function(t) {
              io.emit('ticket:cancelled', {
                ticket_id: t.id,
                room_id:   t.room_id,
                number:    t.number
              });
            });
          }
        });
      })
      .catch(function(err) {
        console.error('[Cron] Ticket expiry error:', err.message);
      });
  });

  console.log('[Cron] Ticket expiry job started (every 5 min)');
}

module.exports = { startTicketExpiryJob };
