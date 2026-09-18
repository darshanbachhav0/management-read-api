import app from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.port, () => {
  console.log(`UMA Management Read API listening on port ${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
