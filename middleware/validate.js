'use strict';

var { validationResult } = require('express-validator');

/**
 * Middleware: run after express-validator checks, return 400 if errors
 */
function validate(req, res, next) {
  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error:  'Validation failed',
      errors: errors.array().map(function(e) {
        return { field: e.path, message: e.msg };
      })
    });
  }
  next();
}

module.exports = validate;
