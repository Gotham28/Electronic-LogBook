import nodemailer from "nodemailer";

export const sendOtpEmail = async (email: string, otp: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const textTemplate = `Your verification code is: ${otp}. It expires in 10 minutes.`;
  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>E-LogBook Registration</h2>
      <p>Your verification code is:</p>
      <h1 style="color: #0d9488; letter-spacing: 5px;">${otp}</h1>
      <p>This code will expire in 10 minutes.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "E-LogBook Registration OTP",
    text: textTemplate,
    html: htmlTemplate,
  });
};

export const sendPasswordResetEmail = async (email: string, otp: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const textTemplate = `Your password reset code is: ${otp}. It expires in 10 minutes.`;
  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>E-LogBook Password Reset</h2>
      <p>Your password reset code is:</p>
      <h1 style="color: #0d9488; letter-spacing: 5px;">${otp}</h1>
      <p>This code will expire in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "E-LogBook Password Reset",
    text: textTemplate,
    html: htmlTemplate,
  });
};

export const sendAccountCreatedEmail = async (email: string, fullName: string, password: string, role: "hod" | "professor", departmentName?: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const roleDisplay = role === "hod" ? "HOD" : "Faculty";
  const deptDisplay = departmentName ? `, Department of ${departmentName}` : "";
  const title = `${roleDisplay}${deptDisplay}`;

  const textTemplate = `Hello ${fullName},

We are pleased to inform you that your account for the E-LogBook Application has been successfully created.

The E-LogBook is a secure digital platform designed to streamline record-keeping, improve data accuracy, and simplify daily logging, monitoring, and reporting. It replaces traditional paper-based logbooks with a centralized digital workflow that enables authorized users to record, review, and manage operational data efficiently.

Your E-LogBook Account Credentials:
Username: ${email}
Password: ${password}
Application URL: ${process.env.APP_URL || "https://www.elogbookgothos.in"}

For security purposes, please do not share your login credentials with others. We highly recommend changing your password after your first login.

Key Features:
- Digital Case Logging: Quickly record patient cases and procedures from any device.
- Real-Time Tracking: Monitor resident progress and approvals in one place.
- Instant Reports: Generate ready-to-print PDF logbooks instantly.

Getting Started:
Please log in using the credentials provided above and verify that you can access the application successfully. If you encounter any issues with logging in, accessing a form, or using any feature of the platform, please contact us using the details below.

We look forward to working with your team and supporting a smooth transition to the E-LogBook platform.

Best regards,
E-LogBook Support Team
+91 9037382416
gothoslabs@gmail.com`;
  
  const htmlTemplate = `
  <div style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>Your E-LogBook Account Has Been Created</h2>
    <p>Hello ${fullName},</p>
    <p>We are pleased to inform you that your account for the E-LogBook Application has been successfully created.</p>
    <p>The E-LogBook is a secure digital platform designed to streamline record-keeping, improve data accuracy, and simplify daily logging, monitoring, and reporting. It replaces traditional paper-based logbooks with a centralized digital workflow that enables authorized users to record, review, and manage operational data efficiently.</p>
    <h3>Your E-LogBook Account Credentials</h3>
    <p><strong>Username:</strong> ${email}<br/>
       <strong>Password:</strong> <code style="font-family: monospace; background: #f4f4f4; padding: 2px 4px;">${password}</code><br/>
       <strong>Application URL:</strong> <a href="${process.env.APP_URL || "https://www.elogbookgothos.in"}">${process.env.APP_URL || "https://www.elogbookgothos.in"}</a></p>
    <p>For security purposes, please do not share your login credentials with others. We highly recommend changing your password after your first login.</p>
    <h3>Key Features</h3>
    <ul>
      <li><strong>Digital Case Logging:</strong> Quickly record patient cases and procedures from any device.</li>
      <li><strong>Real-Time Tracking:</strong> Monitor resident progress and approvals in one place.</li>
      <li><strong>Instant Reports:</strong> Generate ready-to-print PDF logbooks instantly.</li>
    </ul>
    <h3>Getting Started</h3>
    <p>Please log in using the credentials provided above and verify that you can access the application successfully. If you encounter any issues with logging in, accessing a form, or using any feature of the platform, please contact us using the details below.</p>
    <p>We look forward to working with your team and supporting a smooth transition to the E-LogBook platform.</p>
    <p>Best regards,<br/>E-LogBook Support Team<br/>+91 9037382416<br/><a href="mailto:gothoslabs@gmail.com">gothoslabs@gmail.com</a></p>
  </div>
`;

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your E-LogBook Account Has Been Created",
    text: textTemplate,
    html: htmlTemplate,
  });
};
