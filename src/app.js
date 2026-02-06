const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const { env } = require("./config/env");
const { HttpError } = require("./utils/httpError");
const { authRequired } = require("./middleware/auth");
const { dbReady } = require("./middleware/dbReady");
const { registerAuthRoutes } = require("./routes/auth");
const { registerRoomRoutes } = require("./routes/rooms");
const { registerProjectRoutes } = require("./routes/projects");
const { registerAllProjectsRoutes } = require("./routes/projectsAll");
const { registerProjectStateRoutes } = require("./routes/projectState");
const { registerProgressRoutes } = require("./routes/progress");
const { registerAiRoutes } = require("./routes/ai");

function parseOrigins(clientOrigin) {
  const raw = (clientOrigin || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  const allowedOrigins = parseOrigins(env.CLIENT_ORIGIN);
  app.use(
    cors({
      origin: allowedOrigins || true,
      credentials: true,
    })
  );

  app.get("/health", (_req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.json({
      ok: true,
      db: {
        connected: dbConnected,
        name: dbConnected ? mongoose.connection.name : null,
        readyState: mongoose.connection.readyState,
      },
    });
  });

  // AI routes should work even if DB is down, so mount them outside `/api` + `dbReady`.
  registerAiRoutes(app);

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  const api = express.Router();
  const auth = express.Router();
  registerAuthRoutes(auth);
  api.use("/auth", authLimiter, auth);

  const authed = express.Router();
  authed.use(authRequired);

  const rooms = express.Router();
  registerRoomRoutes(rooms);
  authed.use("/rooms", rooms);

  const rest = express.Router();
  registerProjectRoutes(rest);
  registerAllProjectsRoutes(rest);
  registerProjectStateRoutes(rest);
  registerProgressRoutes(rest);
  authed.use("/", rest);

  api.use("/", authed);
  app.use("/api", dbReady, api);

  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "ValidationError", details: err.issues });
    }

    const status = Number(err?.statusCode || 500);
    const message = status >= 500 ? "Internal server error" : err?.message || "Error";

    if (env.NODE_ENV !== "production" && status >= 500) {
      // Keep stack traces in dev to speed up iteration.
      // eslint-disable-next-line no-console
      console.error(err);
    }

    return res.status(status).json({ error: err?.name || "Error", message });
  });

  return app;
}

module.exports = { createApp };
