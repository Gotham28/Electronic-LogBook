import app from "./app";
import { logger } from "./lib/logger";

// mailer.ts reads these directly and has no boot-time check of its own. A missing value is
// otherwise invisible until a real applicant's registration or password-reset email fails
// with a Nodemailer EAUTH error. This must never throw or exit - Render restarts crashed
// services, and a failed deploy would take the whole ELogBook offline for residents who have
// nothing to do with registration.
const missingEmailVars = ["EMAIL_USER", "EMAIL_APP_PASSWORD"].filter((name) => !process.env[name]);
if (missingEmailVars.length > 0) {
  logger.error({ missing: missingEmailVars },
    `Missing email credentials (${missingEmailVars.join(", ")}); registration and password-reset emails will fail until they are set`);
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