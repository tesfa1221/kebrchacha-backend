'use strict';

var multer = require('multer');
var path   = require('path');
var fs     = require('fs');
require('dotenv').config();

var UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Ensure upload directories exist
var paymentsDir = path.join(UPLOAD_DIR, 'payments');
if (!fs.existsSync(paymentsDir)) {
  fs.mkdirSync(paymentsDir, { recursive: true });
}

var storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, paymentsDir);
  },
  filename: function(req, file, cb) {
    var ext       = path.extname(file.originalname).toLowerCase() || '.jpg';
    var timestamp = Date.now();
    var userId    = (req.user && req.user.id) ? req.user.id : 'unknown';
    cb(null, 'payment_' + userId + '_' + timestamp + ext);
  }
});

var fileFilter = function(req, file, cb) {
  var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (allowedTypes.indexOf(file.mimetype) !== -1) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP images are allowed'), false);
  }
};

var upload = multer({
  storage:    storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB — phones take large screenshots
  }
});

module.exports = upload;
