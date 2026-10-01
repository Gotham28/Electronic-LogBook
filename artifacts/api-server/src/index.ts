import app from "./app";
import { logger } from "./lib/logger";

// A missing value is visible at startup, while the app remains available. Email routes also
// surface per-message acceptance failures to the actor who initiated the action.
const missingEmailVars = ["RESEND_API_KEY", "EMAIL_FROM"].filter((name) => !process.env[name]);
if (missingEmailVars.length > 0) {
  logger.error({ missing: missingEmailVars },
    `Missing email credentials (${missingEmailVars.join(", ")}); automated email delivery is unavailable until they are set`);
}

// Use Render's port if available, otherwise default to 3000 for local testing
const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Explicitly binding to "0.0.0.0" ensures Render can route outside traffic to it
app.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
