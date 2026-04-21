'use strict';
// Quick connection test - no credentials stored
var mysql = require('mysql2');
var conn = mysql.createConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});
conn.connect(function(err) {
  if (err) { console.error('FAIL:', err.message); process.exit(1); }
  console.log('Connected OK');
  conn.query("SELECT @@sql_mode as mode", function(e, r) {
    console.log('SQL mode:', r && r[0] && r[0].mode);
    conn.query("SHOW TABLES", function(e2, tables) {
      console.log('Tables:', tables ? tables.map(function(t){return Object.values(t)[0];}).join(', ') : 'none');
      conn.end();
    });
  });
});
