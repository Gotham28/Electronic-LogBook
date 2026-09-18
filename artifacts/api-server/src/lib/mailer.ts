import nodemailer from "nodemailer";

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
}

function wrapEmail(title: string, innerHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#e8eef3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e8eef3;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff;">
          <tr>
            <td style="background-color:#0f766e; padding:28px 40px;">
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:1.6px; text-transform:uppercase; color:#99f6e4;">Gothos Labs</p>
              <p style="margin:8px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:22px; font-weight:bold; color:#ffffff;">E-LogBook</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 8px; font-family:Arial, Helvetica, sans-serif;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px; font-family:Arial, Helvetica, sans-serif; border-top:1px solid #e2e8f0; background-color:#f8fafc;">
              <p style="margin:0; font-size:13px; font-weight:bold; color:#334155;">E-Logbook Support Team</p>
              <p style="margin:6px 0 0; font-size:12px; color:#64748b; line-height:1.6;">
                +91 9037382416 &nbsp;|&nbsp;
                <a href="mailto:gothoslabs@gmail.com" style="color:#0f766e; text-decoration:none;">gothoslabs@gmail.com</a>
              </p>
              <p style="margin:16px 0 0; font-size:11px; color:#94a3b8;">This is an automated message. Please do not reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function credentialRow(label: string, valueHtml: string, last = false) {
  const border = last ? "" : "border-bottom:1px solid #d1fae5;";
  return `<tr>
    <td style="padding:10px 0; ${border} width:34%; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#64748b; vertical-align:top;">${label}</td>
    <td style="padding:10px 0; ${border} font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#0f172a; font-weight:bold;">${valueHtml}</td>
  </tr>`;
}

export const sendOtpEmail = async (email: string, otp: string) => {
  const transporter = createTransporter();
  const textTemplate = `Your verification code is: ${otp}. It expires in 10 minutes.`;
  const htmlTemplate = wrapEmail(
    "E-LogBook Registration OTP",
    `<p style="margin:0; font-size:22px; font-weight:bold; color:#0f172a;">Confirm your registration</p>
     <p style="margin:12px 0 0; font-size:15px; line-height:1.7; color:#475569;">Use this one-time code to finish creating your E-LogBook account. It expires in 10 minutes.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
       <tr>
         <td align="center" style="background-color:#f0fdfa; border:1px solid #99f6e4; padding:22px;">
           <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:32px; font-weight:bold; letter-spacing:8px; color:#0f766e;">${otp}</p>
         </td>
       </tr>
     </table>
     <p style="margin:0; font-size:13px; color:#64748b; line-height:1.6;">If you did not request this code, you can ignore this email.</p>`
  );

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "E-LogBook Registration OTP",
    text: textTemplate,
    html: htmlTemplate,
  });
};

export const sendPasswordResetEmail = async (email: string, otp: string) => {
  const transporter = createTransporter();
  const textTemplate = `Your password reset code is: ${otp}. It expires in 10 minutes.`;
  const htmlTemplate = wrapEmail(
    "E-LogBook Password Reset",
    `<p style="margin:0; font-size:22px; font-weight:bold; color:#0f172a;">Reset your password</p>
     <p style="margin:12px 0 0; font-size:15px; line-height:1.7; color:#475569;">Use this one-time code to reset your E-LogBook password. It expires in 10 minutes.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
       <tr>
         <td align="center" style="background-color:#f0fdfa; border:1px solid #99f6e4; padding:22px;">
           <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:32px; font-weight:bold; letter-spacing:8px; color:#0f766e;">${otp}</p>
         </td>
       </tr>
     </table>
     <p style="margin:0; font-size:13px; color:#64748b; line-height:1.6;">If you did not request a password reset, you can ignore this email.</p>`
  );

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "E-LogBook Password Reset",
    text: textTemplate,
    html: htmlTemplate,
  });
};

export const sendAccountCreatedEmail = async (
  email: string,
  fullName: string,
  password: string,
  role: "hod" | "professor" | "student",
  departmentName?: string
) => {
  const transporter = createTransporter();
  const roleDisplay = role === "hod" ? "HOD" : role === "student" ? "Student" : "Faculty";
  const deptDisplay = departmentName ? `, ${departmentName}` : "";
  const appUrl = process.env.APP_URL || "https://elogbookgothos.in";

  const textTemplate = `Dear ${fullName},

We are pleased to inform you that your account for the E-Logbook Application has been successfully created.

The E-Logbook is a secure digital platform designed to streamline record-keeping, improve data accuracy, and simplify daily logging, monitoring, and reporting. It replaces traditional paper-based logbooks with a centralized digital workflow.

Your E-Logbook Account Credentials
---
Role:             ${roleDisplay}${deptDisplay}
Username:         ${email}
Password:         ${password}
Application URL:  ${appUrl}
---

For security, please do not share your credentials. We strongly recommend changing your password after your first login.

Key Features:
- Centralized Digital Entry: Record and review data from any device.
- Automated Audit Trails: Timestamped records for accountability and traceability.
- Customizable Forms & Workflows: Configured to your department's requirements.
- Dashboards & Monitoring: Real-time visualizations of operational data.
- Instant Reporting: Generate PDF and Excel reports on demand.

Getting Started:
Log in with the credentials above. If you face any issues, contact us at the details below.

Best regards,
E-Logbook Support Team
+91 9037382416
gothoslabs@gmail.com`;

  const featureRows = [
    ["Centralized Digital Entry", "Record and review clinical data from any device, anytime."],
    ["Automated Audit Trails", "Timestamped records support accountability and traceability."],
    ["Customizable Forms", "Workflows configured to your department's specific requirements."],
    ["Dashboards & Monitoring", "Structured dashboards and real-time data visualizations."],
    ["Instant Reporting", "Generate PDF and Excel reports on demand."],
  ].map(([title, desc], index, list) => {
    const border = index === list.length - 1 ? "" : "border-bottom:1px solid #e2e8f0;";
    return `<tr>
      <td style="padding:12px 0; ${border}">
        <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#0f172a;">${title}</p>
        <p style="margin:4px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#64748b; line-height:1.5;">${desc}</p>
      </td>
    </tr>`;
  }).join("");

  const htmlTemplate = wrapEmail(
    "E-Logbook — Account Created",
    `<p style="margin:0; font-size:22px; font-weight:bold; color:#0f172a;">Welcome, ${fullName}</p>
     <p style="margin:8px 0 0; font-size:12px; letter-spacing:0.4px; text-transform:uppercase; color:#0f766e;">${roleDisplay}${deptDisplay}</p>
     <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#475569;">Your E-Logbook account has been created. Use the credentials below to log in and start recording your clinical work.</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px; background-color:#f0fdfa; border:1px solid #99f6e4;">
       <tr>
         <td style="padding:22px 24px;">
           <p style="margin:0 0 12px; font-family:Arial, Helvetica, sans-serif; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#0f766e;">Your login credentials</p>
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
             ${credentialRow("Role", `${roleDisplay}${deptDisplay}`)}
             ${credentialRow("Username", email)}
             ${credentialRow("Password", `<span style="font-family:Consolas, Courier, monospace; background-color:#ccfbf1; padding:4px 8px;">${password}</span>`)}
             ${credentialRow("App URL", `<a href="${appUrl}" style="color:#0f766e; text-decoration:none;">${appUrl}</a>`, true)}
           </table>
           <p style="margin:16px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#64748b; line-height:1.6;">Please change your password on first login and do not share these credentials.</p>
         </td>
       </tr>
     </table>

     <p style="margin:24px 0 0; font-size:15px; line-height:1.7; color:#334155;">The E-Logbook replaces paper logbooks with a secure digital workflow for recording, reviewing, and reporting clinical work.</p>
     <p style="margin:24px 0 8px; font-size:12px; font-weight:bold; letter-spacing:0.8px; text-transform:uppercase; color:#0f172a;">What you can do</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${featureRows}</table>

     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 12px;">
       <tr>
         <td style="background-color:#0f766e;">
           <a href="${appUrl}" style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#ffffff; text-decoration:none;">Log in to E-LogBook</a>
         </td>
       </tr>
     </table>`
  );

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your E-LogBook Account Has Been Created",
    text: textTemplate,
    html: htmlTemplate,
  });
};

export const sendHODApprovalRequestEmail = async (
  hodEmail: string,
  hodName: string,
  studentName: string,
  studentReg: string,
  departmentName: string
) => {
  const transporter = createTransporter();
  const appUrl = process.env.APP_URL || "https://elogbookgothos.in";

  const textTemplate = `Dear ${hodName},

A new student, ${studentName} (${studentReg}), has registered for the ${departmentName} department and is awaiting your approval.

Please log in to the E-Logbook application to review their registration.

Application URL: ${appUrl}
Go to the "Student Access" tab to approve or deny the request.

Best regards,
E-Logbook Support Team`;

  const htmlTemplate = wrapEmail(
    "Pending Student Approval",
    `<p style="margin:0; font-size:22px; font-weight:bold; color:#0f172a;">Action Required: Pending Student Approval</p>
     <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#475569;">Dear ${hodName},</p>
     <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#475569;">A new student, <strong>${studentName}</strong> (Reg No: ${studentReg}), has registered for the ${departmentName} department and is awaiting your approval.</p>

     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 12px;">
       <tr>
         <td style="background-color:#0f766e;">
           <a href="${appUrl}/student-access" style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#ffffff; text-decoration:none;">Review Registration</a>
         </td>
       </tr>
     </table>
     <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#475569;">Please log in and go to the "Student Access" tab in your portal to approve or deny the request.</p>`
  );

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: hodEmail,
    subject: "Action Required: Pending Student Approval",
    text: textTemplate,
    html: htmlTemplate,
  });
};
