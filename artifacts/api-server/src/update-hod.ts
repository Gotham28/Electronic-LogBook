import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

async function updateAccount() {
  const userId = 3;
  const newEmail = "drmtpmohd@gmail.com";
  const newPassword = process.env.NEW_PASSWORD;

  if (!newPassword) {
    throw new Error("ERROR: Please provide the new password via the NEW_PASSWORD environment variable.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  console.log(`Starting update for User ID ${userId}...`);
  
  // 1. Database Update (Wrapped in a Transaction)
  await db.transaction(async (tx) => {
    // Read the current session version so we can explicitly increment it
    const [user] = await tx.select({ sessionVersion: usersTable.sessionVersion })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`User ID ${userId} not found in the database.`);
    }

    console.log("Executing SQL update...");
    // Drizzle translates this into:
    // UPDATE users SET email = $1, password_hash = $2, session_version = $3 WHERE id = $4
    await tx.update(usersTable)
      .set({
        email: newEmail,
        passwordHash,
        sessionVersion: user.sessionVersion + 1,
      })
      .where(eq(usersTable.id, userId));
  });

  console.log("Database update committed successfully.");

  // 2. Send Notification Email (Only happens if TX commits without throwing)
  console.log("Dispatching notification email...");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const textTemplate = `Your E-LogBook account details have been updated.\n\nYour login email is now: ${newEmail}\nYour new password is: ${newPassword}\n\nPlease log in and change your password from account settings as soon as possible.`;
  
  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>E-LogBook Account Updated</h2>
      <p>Your E-LogBook account details have been updated.</p>
      <p><strong>Login Email:</strong> ${newEmail}</p>
      <p><strong>Initial Password:</strong> <code style="font-family: monospace; background: #f4f4f4; padding: 2px 4px;">${newPassword}</code></p>
      <p>Please log in and change your password from your account settings as soon as possible.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: newEmail,
    subject: "Your E-LogBook Account Details Have Been Updated",
    text: textTemplate,
    html: htmlTemplate,
  });

  console.log("Email sent successfully!");
  process.exit(0);
}

updateAccount().catch((err) => {
  console.error("Operation failed:", err.message);
  process.exit(1);
});
