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
  connectTimeout:     30000
});

// Fix Aiven ANSI_QUOTES mode — run on every new connection
pool.on('connection', function(connection) {
  connection.query("SET sql_mode=(SELECT REPLACE(@@sql_mode,'ANSI_QUOTES',''))");
});

var promisePool = pool.promise();

pool.getConnection(function(err, connection) {
  if (err) {
    console.error('[DB] Connection failed:', err.message);
    return;
  }
  console.log('[DB] MySQL connected successfully');
  connection.release();
});

module.exports = promisePool;
