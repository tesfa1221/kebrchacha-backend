'use strict';

var rateLimit = require('express-rate-limit');

// General API limiter
var apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict limiter for auth routes
var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later.' }
});

// Upload limiter
var uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Too many uploads, please wait before trying again.' }
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
