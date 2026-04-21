'use strict';

var mysql = require('mysql2');
require('dotenv').config();

var sslConfig = null;

// Aiven and most cloud MySQL providers require SSL
if (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') {
  sslConfig = {
    rejectUnauthorized: false  // Aiven uses self-signed certs on free tier
  };
}

var pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'kebrchacha',
  ssl:                sslConfig,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  connectTimeout:     30000,
  // Disable ANSI_QUOTES mode for Aiven MySQL compatibility
  // This ensures double-quoted strings are treated as string literals
  multipleStatements: false
});

var promisePool = pool.promise();

// Test connection on startup
pool.getConnection(function(err, connection) {
  if (err) {
    console.error('[DB] Connection failed:', err.message);
    return;
  }
  // Fix Aiven strict SQL mode — remove ANSI_QUOTES
  connection.query(
    "SET SESSION sql_mode = REPLACE(@@SESSION.sql_mode, 'ANSI_QUOTES', '')",
    function(modeErr) {
      if (modeErr) {
        console.warn('[DB] sql_mode warning:', modeErr.message);
      }
      console.log('[DB] MySQL connected successfully');
      connection.release();
    }
  );
});

module.exports = promisePool;
