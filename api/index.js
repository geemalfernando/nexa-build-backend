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
  await ensureDb();
  return app(req, res);
};

