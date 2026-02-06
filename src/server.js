const { env, requireEnv } = require("./config/env");
const { connectDb } = require("./config/db");
const { createApp } = require("./app");

async function main() {
  // Fail fast with clear errors if env is missing.
  requireEnv("DATABASE_URL");
  requireEnv("JWT_SECRET");

  await connectDb();

  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
