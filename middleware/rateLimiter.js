'use strict';

var rateLimit = require('express-rate-limit');

// General API — 1000 requests per 15 min (generous for real users)
var apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'ብዙ ጥያቄዎች። ትንሽ ቆይተው ይሞክሩ።' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: function(req) {
    // Never rate-limit health checks or rooms listing
    return req.path === '/health' || req.path === '/api/health' || req.path === '/api/rooms';
  }
});

// Auth routes — 50 per 15 min
var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'ብዙ ሙከራዎች። ትንሽ ቆይተው ይሞክሩ።' }
});

// Upload — 20 per 10 min
var uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'ብዙ ስቅሎች። ትንሽ ቆይተው ይሞክሩ።' }
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
