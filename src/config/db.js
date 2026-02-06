const mongoose = require("mongoose");
const { requireEnv } = require("./env");

async function connectDb() {
  const databaseUrl = requireEnv("DATABASE_URL");

  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(databaseUrl, { autoIndex: true });

    // eslint-disable-next-line no-console
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
  } catch (err) {
    const code = err?.code;
    const hostname = err?.hostname;
    const syscall = err?.syscall;

    // eslint-disable-next-line no-console
    console.error("MongoDB connection failed.");

    if (syscall === "querySrv" && typeof hostname === "string" && hostname.startsWith("_mongodb._tcp.")) {
      // eslint-disable-next-line no-console
      console.error(
        "Your DNS/network is blocking MongoDB SRV lookups. Try disabling VPN/proxy, changing DNS, or use a non-SRV Atlas connection string (mongodb://host1,host2,host3/...)."
      );
    } else if (code === "ENOTFOUND") {
      // eslint-disable-next-line no-console
      console.error("DNS lookup failed. Check your internet/DNS settings and that the cluster host is correct.");
    }

    throw err;
  }
}

module.exports = { connectDb };
