'use strict';

var mysql = require('mysql2');
require('dotenv').config();

var pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'kebrchacha',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4'
});

var promisePool = pool.promise();

// Test connection on startup
pool.getConnection(function(err, connection) {
  if (err) {
    console.error('[DB] Connection failed:', err.message);
    return;
  }
  console.log('[DB] MySQL connected successfully');
  connection.release();
});

module.exports = promisePool;
