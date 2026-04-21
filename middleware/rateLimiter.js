'use strict';

var rateLimit = require('express-rate-limit');

// General API — 500 requests per 15 min (generous for real users)
var apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'ብዙ ጥያቄዎች። ትንሽ ቆይተው ይሞክሩ።' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: function(req) {
    // Never rate-limit health checks
    return req.path === '/health';
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
