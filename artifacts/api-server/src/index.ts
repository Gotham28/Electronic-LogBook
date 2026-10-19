import app from "./app";
import { logger } from "./lib/logger";
import { startNameChangeEmailDispatcher } from "./lib/name-change-email-dispatcher.js";

// A missing value is visible at startup, while the app remains available. Email routes also
// surface per-message acceptance failures to the actor who initiated the action.
const missingEmailVars = ["RESEND_API_KEY", "EMAIL_FROM", "APP_URL"].filter((name) => !process.env[name]);
if (missingEmailVars.length > 0) {
  logger.error({ missing: missingEmailVars },
    `Missing email configuration (${missingEmailVars.join(", ")}); automated email delivery is unavailable until they are set`);
}

// Use Render's port if available, otherwise default to 3000 for local testing
const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Explicitly binding to "0.0.0.0" ensures Render can route outside traffic to it
const server = app.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  stopNameChangeEmailDispatcher = startNameChangeEmailDispatcher();
});

let stopNameChangeEmailDispatcher: (() => Promise<void>) | undefined;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Server shutting down");
  if (stopNameChangeEmailDispatcher) await stopNameChangeEmailDispatcher();
  server.close((error) => {
    if (error) {
      logger.error({ status: 500 }, "Server shutdown failed");
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
  });
}

process.on("SIGTERM", (signal) => { void shutdown(signal); });
process.on("SIGINT", (signal) => { void shutdown(signal); });
