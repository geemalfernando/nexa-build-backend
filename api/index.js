const { connectDb } = require("../src/config/db");
const { createApp } = require("../src/app");

const app = createApp();

let dbPromise = null;

async function ensureDb() {
  if (!dbPromise) {
    dbPromise = connectDb().catch((err) => {
      // Allow retries on later invocations if the first connect fails.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

module.exports = async (req, res) => {
  const url = req?.url || "";
  const skipDb =
    url.startsWith("/ai/") ||
    url.startsWith("/api/ai/") ||
    url === "/health" ||
    url.startsWith("/health?");
  if (!skipDb) {
    await ensureDb();
  }
  return app(req, res);
};
