'use strict';

var cloudinary = require('cloudinary').v2;
var multer = require('multer');
require('dotenv').config();

// Configure Cloudinary (add these to your .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Memory storage for multer (we'll upload to Cloudinary, not disk)
var storage = multer.memoryStorage();

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
    fileSize: 15 * 1024 * 1024 // 15MB
  }
});

// Upload to Cloudinary
function uploadToCloudinary(buffer, filename) {
  return new Promise(function(resolve, reject) {
    var uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'kebrchacha/payments',
        public_id: filename.replace(/\.[^.]+$/, ''), // Remove extension
        resource_type: 'image',
        format: 'jpg', // Convert all to JPG for consistency
        quality: 'auto:good'
      },
      function(error, result) {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

module.exports = { upload: upload, uploadToCloudinary: uploadToCloudinary };