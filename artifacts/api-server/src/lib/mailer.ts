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

  const textTemplate = `Hello ${fullName},\n\nAn account has been created for you (${title}).\n\nLogin Email: ${email}\nInitial Password: ${password}\n\nPlease log in and change your password from your account settings as soon as possible.`;
  
  const htmlTemplate = \`
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Your E-LogBook Account Has Been Created</h2>
      <p>Hello ${fullName},</p>
      <p>An account has been created for you (<strong>\${title}</strong>).</p>
      <p><strong>Login Email:</strong> \${email}</p>
      <p><strong>Initial Password:</strong> <code style="font-family: monospace; background: #f4f4f4; padding: 2px 4px;">\${password}</code></p>
      <p>Please log in and change your password from your account settings as soon as possible.</p>
    </div>
  \`;

  await transporter.sendMail({
    from: \`"E-LogBook" <\${process.env.EMAIL_USER}>\`,
    to: email,
    subject: "Your E-LogBook Account Has Been Created",
    text: textTemplate,
    html: htmlTemplate,
  });
};
