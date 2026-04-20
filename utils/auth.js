'use strict';

var jwt = require('jsonwebtoken');
require('dotenv').config();

var JWT_SECRET = process.env.JWT_SECRET || 'kebrchacha_secret_fallback';

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    {
      id:          user.id,
      telegram_id: user.telegram_id,
      username:    user.username,
      is_admin:    user.is_admin
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Verify a JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware: require authenticated user
 */
function requireAuth(req, res, next) {
  var authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  var parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization format' });
  }

  var decoded = verifyToken(parts[1]);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

/**
 * Express middleware: require admin user
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, function() {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = {
  generateToken: generateToken,
  verifyToken:   verifyToken,
  requireAuth:   requireAuth,
  requireAdmin:  requireAdmin
};
