const jwt = require("jsonwebtoken");
const { env, requireEnv } = require("../config/env");
const { HttpError } = require("../utils/httpError");

function authRequired(req, _res, next) {
  // Let CORS preflight (OPTIONS) through without auth so the browser can get 2xx and then send the real request with the token.
  if (req.method === "OPTIONS") return next();

  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");

  if (!token) {
    return next(new HttpError(401, "Missing Authorization token"));
  }

  try {
    const secret = env.JWT_SECRET || requireEnv("JWT_SECRET");
    const payload = jwt.verify(token, secret);
    req.user = { id: payload.sub };
    return next();
  } catch (_err) {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}

module.exports = { authRequired };

