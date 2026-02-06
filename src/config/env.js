const path = require("path");

// Load `.env` from the server directory (safe no-op if missing).
// This keeps env loading consistent regardless of the working directory.
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  requireEnv,
  env: {
    NODE_ENV: process.env.NODE_ENV || "development",
    // Default to 5001 to avoid macOS services commonly occupying 5000,
    // and to match the frontend default `NEXT_PUBLIC_API_URL`.
    PORT: Number(process.env.PORT || 5001),
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "",
  },
};
