const mongoose = require("mongoose");
const { HttpError } = require("../utils/httpError");

function dbReady(req, _res, next) {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState !== 1) {
    return next(new HttpError(503, "Database not connected"));
  }
  return next();
}

module.exports = { dbReady };

