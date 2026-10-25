import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";

async function start() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  app.listen(env.PORT, () =>
    console.info(JSON.stringify({ event: "server_started", port: env.PORT })),
  );
}
start().catch((error) => {
  console.error(
    JSON.stringify({
      event: "startup_failed",
      error: error instanceof Error ? error.name : "Error",
    }),
  );
  process.exit(1);
});
