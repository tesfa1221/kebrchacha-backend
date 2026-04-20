'use strict';

require('dotenv').config();

var express    = require('express');
var http       = require('http');
var socketIo   = require('socket.io');
var cors       = require('cors');
var path       = require('path');

var authRoutes          = require('./routes/auth');
var adminAuthRoutes     = require('./routes/admin-auth');
var roomsRoutes         = require('./routes/rooms');
var ticketsRoutes       = require('./routes/tickets');
var paymentsRoutes      = require('./routes/payments');
var winnersRoutes       = require('./routes/winners');
var historyRoutes       = require('./routes/history');
var notificationsRoutes = require('./routes/notifications');
var leaderboardRoutes   = require('./routes/leaderboard');

var { apiLimiter, authLimiter, uploadLimiter } = require('./middleware/rateLimiter');
var { startTicketExpiryJob }                   = require('./jobs/ticketExpiry');

var PORT         = process.env.PORT         || 3001;
var FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

var app    = express();
var server = http.createServer(app);
var io     = socketIo(server, {
  cors:       { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  allowEIO3:  true
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Store io instance for routes
app.set('io', io);

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/payments/upload', uploadLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/admin',     adminAuthRoutes);
app.use('/api/rooms',     roomsRoutes);
app.use('/api/rooms',     winnersRoutes);
app.use('/api/tickets',   ticketsRoutes);
app.use('/api/payments',  paymentsRoutes);
app.use('/api/history',   historyRoutes);
app.use('/api/notify',    notificationsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', function(socket) {
  console.log('[Socket] Client connected:', socket.id);
  socket.on('join:room',  function(d) { socket.join('room:' + d.room_id); });
  socket.on('leave:room', function(d) { socket.leave('room:' + d.room_id); });
  socket.on('disconnect', function()  { console.log('[Socket] Disconnected:', socket.id); });
});

// ─── Background jobs ──────────────────────────────────────────────────────────
startTicketExpiryJob(io);

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, function() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   KEBRCHACHA Backend Running           ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║  Port:       ' + PORT);
  console.log('║  Env:        ' + (process.env.NODE_ENV || 'development'));
  console.log('║  Socket.io:  Enabled');
  console.log('║  Rate limit: Enabled');
  console.log('║  Cron jobs:  Enabled');
  console.log('╚════════════════════════════════════════╝');
});

process.on('SIGTERM', function() {
  server.close(function() { process.exit(0); });
});
