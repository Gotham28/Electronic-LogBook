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
Application URL: ${process.env.APP_URL || "https://elogbook.example.com"}

For security purposes, please do not share your login credentials with others. We highly recommend changing your password after your first login.

Key Features:
- Centralized Digital Entry: Record, update, and review operational data through mobile and desktop devices.
- Automated Audit Trails: Maintain timestamped records to support accountability, traceability, and data integrity.
- Customizable Forms & Workflows: Digital forms and workflows configured according to your department's specific requirements.
- Dashboards & Monitoring: Access relevant operational information through structured dashboards and real-time visualizations.
- Instant Reporting: Generate structured reports in PDF and Excel formats for review and documentation.

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
      <p>An account has been created for you (<strong>${title}</strong>).</p>
      <p><strong>Login Email:</strong> ${email}</p>
      <p><strong>Initial Password:</strong> <code style="font-family: monospace; background: #f4f4f4; padding: 2px 4px;">${password}</code></p>
      <p>Please log in and change your password from your account settings as soon as possible.</p>
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
