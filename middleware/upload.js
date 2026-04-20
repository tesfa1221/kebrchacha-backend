'use strict';

var multer = require('multer');
var path   = require('path');
var fs     = require('fs');
require('dotenv').config();

var UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

var storage = multer.diskStorage({
  destination: function(req, file, cb) {
    var dir = path.join(UPLOAD_DIR, 'payments');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    var ext       = path.extname(file.originalname).toLowerCase();
    var timestamp = Date.now();
    var userId    = (req.user && req.user.id) ? req.user.id : 'unknown';
    cb(null, 'payment_' + userId + '_' + timestamp + ext);
  }
});

var fileFilter = function(req, file, cb) {
  var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.indexOf(file.mimetype) !== -1) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

var upload = multer({
  storage:   storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

module.exports = upload;
