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

export const sendAccountCreatedEmail = async (email: string, fullName: string, password: string, role: "hod" | "professor" | "student", departmentName?: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const roleDisplay = role === "hod" ? "HOD" : role === "student" ? "Student" : "Faculty";
  const deptDisplay = departmentName ? `, Department of ${departmentName}` : "";
  const title = `${roleDisplay}${deptDisplay}`;
  const appUrl = process.env.APP_URL || "https://elogbookgothos.in";

  const textTemplate = `Dear ${fullName},

We are pleased to inform you that your account for the E-Logbook Application has been successfully created.

The E-Logbook is a secure digital platform designed to streamline record-keeping, improve data accuracy, and simplify daily logging, monitoring, and reporting. It replaces traditional paper-based logbooks with a centralized digital workflow that enables authorized users to record, review, and manage operational data efficiently.

Your E-Logbook Account Credentials
Please use the following credentials to access the E-Logbook application:

Username: ${email}
Password: ${password}
Application URL: ${appUrl}

For security purposes, please do not share your login credentials with others. We highly recommend changing your password after your first login.

Key Features
The E-Logbook platform provides:
- Centralized Digital Entry: Record, update, and review operational data through mobile and desktop devices.
- Automated Audit Trails: Maintain timestamped records to support accountability, traceability, and data integrity.
- Customizable Forms & Workflows: Digital forms and workflows configured according to your department's specific requirements.
- Dashboards & Monitoring: Access relevant operational information through structured dashboards and real-time visualizations.
- Instant Reporting: Generate structured reports in PDF and Excel formats for review and documentation.

Getting Started
Please log in using the credentials provided above and verify that you can access the application successfully. If you encounter any issues with logging in, accessing a form, or using any feature of the platform, please contact us using the details below.

We look forward to working with your team and supporting a smooth transition to the E-Logbook platform.

Best regards,
E-Logbook Support Team
+91 9037382416
gothoslabs@gmail.com`;

  const htmlTemplate = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>E-Logbook Account Created</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style type="text/css">
      a{ outline:none; color:#5277ff; text-decoration:underline; }
      a:hover{text-decoration:none !important;}
      a[x-apple-data-detectors]{color:inherit !important; text-decoration:none !important;}
      .rollover:hover, .button:hover{opacity:0.8;}
      .rollover, .button{ -webkit-transition:all 0.3s ease; -moz-transition:all 0.3s ease; -ms-transition:all 0.3s ease; transition:all 0.3s ease; }
      .rollover a:hover, .button a:hover{text-decoration: none !important;}
      a img{border:none;}
      table td{mso-line-height-rule:exactly;}
      .ExternalClass, .ExternalClass a, .ExternalClass span, .ExternalClass b, .ExternalClass br, .ExternalClass p, .ExternalClass div{line-height:inherit;}
      img{max-width: 100%; height: auto;}
      @media only screen and (max-width:500px) {
        table[class="flexible"]{width:100% !important;}
        *[class="hide"]{display:none !important; width:0 !important; height:0 !important; padding:0 !important; font-size:0 !important; line-height:0 !important;}
        td[class="heading"]{font-size: 26px !important; line-height: 32px !important;}
        td[class="indent-01"] {padding-top: 34px !important;}
        td[class="indent-02"] {padding-bottom: 44px !important;}
        td[class="indent-03"]{border-top-width: 10px !important; padding-bottom: 0 !important;}
        td[class="indent-04"]{padding-top: 36px !important; padding-bottom: 60px !important;}
        td[class="height-01"] {height: 50px !important;}
      }
    </style>
  </head>
  <body style="margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;" bgcolor="#f0f4f7">
    <table style="min-width:320px;" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f0f4f7">
      <tbody>
        <tr>
          <td style="line-height:0;">
            <div style="display:none; white-space:nowrap; font:15px/1px courier;">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</div>
          </td>
        </tr>
        <!-- top blue header -->
        <tr>
          <td bgcolor="#184da1" valign="top" align="center">
            <table class="flexible" style="margin: 0 auto;" width="630" align="center" cellpadding="0" cellspacing="0">
              <tbody>
                <tr>
                  <td style="padding: 0 15px;" valign="top">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tbody>
                        <tr>
                          <td class="indent-01" style="padding: 48px 20px 31px;" align="center" valign="top">
                            <a style="text-decoration: none; color: #ffffff; font-size: 26px; font-weight: bold; font-family: Arial, Helvetica, sans-serif;">
                              E-LogBook
                            </a>
                          </td>
                        </tr>
                        <!-- white card top -->
                        <tr>
                          <td style="box-shadow: 0 3px 13px rgba(0,0,0,0.05); border-radius: 5px 5px 0 0; border-bottom: 1px solid #ffffff;" bgcolor="#ffffff" valign="top">
                            <table width="100%" cellspacing="0" cellpadding="0">
                              <tbody>
                                <tr>
                                  <td style="padding: 34px 20px 6px;" align="center" valign="top">
                                    <table class="flexible" style="margin: 0 auto;" align="center" width="476" cellpadding="0" cellspacing="0">
                                      <tbody>
                                        <tr>
                                          <td valign="top">
                                            <table width="100%" cellpadding="0" cellspacing="0">
                                              <tbody>
                                                <!-- badge -->
                                                <tr>
                                                  <td style="padding-bottom: 21px;" valign="top">
                                                    <table style="margin: 0 auto;" cellpadding="0" cellspacing="0" align="center">
                                                      <tbody>
                                                        <tr>
                                                          <td style="border-radius: 100px; font: bold 10px/13px Arial, Helvetica, sans-serif; color: #68778d; text-transform: uppercase;" align="center" bgcolor="#edf1f3">
                                                            <span style="display: block; padding: 6px 18px;">Welcome</span>
                                                          </td>
                                                        </tr>
                                                      </tbody>
                                                    </table>
                                                  </td>
                                                </tr>
                                                <!-- heading -->
                                                <tr>
                                                  <td class="indent-02" style="padding-bottom: 30px;" valign="top">
                                                    <table width="100%" cellpadding="0" cellspacing="0">
                                                      <tbody>
                                                        <tr>
                                                          <td class="heading" style="font: bold 28px/34px Arial, Helvetica, sans-serif; color: #353d58;" align="center">
                                                            Welcome to E-LogBook!
                                                          </td>
                                                        </tr>
                                                      </tbody>
                                                    </table>
                                                  </td>
                                                </tr>
                                                <!-- intro text -->
                                                <tr>
                                                  <td style="font: 16px/28px Arial, Helvetica, sans-serif; color: #475171; padding-bottom: 20px;">
                                                    Dear <strong>${fullName}</strong>,
                                                    <br><br>
                                                    We are pleased to inform you that your account for the E-Logbook Application has been successfully created.
                                                    <br><br>
                                                    The E-Logbook is a secure digital platform designed to streamline record-keeping, improve data accuracy, and simplify daily logging, monitoring, and reporting. It replaces traditional paper-based logbooks with a centralized digital workflow that enables authorized users to record, review, and manage operational data efficiently.
                                                    <br><br>
                                                    <strong>Your E-Logbook Account Credentials</strong><br>
                                                    Please use the following credentials to access the E-Logbook application:
                                                    <br><br>
                                                    <strong>Username:</strong> ${email}<br>
                                                    <strong>Password:</strong> <code style="font-family: monospace; background: #f4f4f4; padding: 2px 6px; border-radius: 3px;">${password}</code><br>
                                                    <strong>Application URL:</strong> <a href="${appUrl}" style="color: #184da1;">${appUrl}</a>
                                                    <br><br>
                                                    For security purposes, please do not share your login credentials with others. We highly recommend changing your password after your first login.
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="border-bottom: 8px solid #f0f4f7; font-size: 0; line-height: 0;" height="1" bgcolor="#ffffff">&nbsp;</td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <!-- white card bottom -->
        <tr>
          <td align="center" valign="top">
            <table class="flexible" style="margin: 0 auto;" width="630" align="center" cellpadding="0" cellspacing="0">
              <tbody>
                <tr>
                  <td style="padding: 0 15px;" valign="top">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tbody>
                        <tr>
                          <td style="border-top: 8px solid #f0f4f7; font-size: 0; line-height: 0;" height="1" bgcolor="#ffffff">&nbsp;</td>
                        </tr>
                        <tr>
                          <td valign="top">
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tbody>
                                <tr>
                                  <td style="padding: 0 20px;" bgcolor="#ffffff" align="center" valign="top">
                                    <table class="flexible" style="margin: 0 auto;" align="center" width="476" cellpadding="0" cellspacing="0">
                                      <tbody>
                                        <tr>
                                          <td style="font: 16px/28px Arial, Helvetica, sans-serif; color: #475171; padding-bottom: 24px;">
                                            <strong>Key Features</strong><br>
                                            The E-Logbook platform provides:
                                            <ul style="padding-left: 20px; margin: 10px 0 20px 0;">
                                              <li><strong>Centralized Digital Entry:</strong> Record, update, and review operational data through mobile and desktop devices.</li>
                                              <li><strong>Automated Audit Trails:</strong> Maintain timestamped records to support accountability, traceability, and data integrity.</li>
                                              <li><strong>Customizable Forms &amp; Workflows:</strong> Digital forms and workflows configured according to your department's specific requirements.</li>
                                              <li><strong>Dashboards &amp; Monitoring:</strong> Access relevant operational information through structured dashboards and real-time visualizations.</li>
                                              <li><strong>Instant Reporting:</strong> Generate structured reports in PDF and Excel formats for review and documentation.</li>
                                            </ul>
                                            <strong>Getting Started</strong><br><br>
                                            Please log in using the credentials provided above and verify that you can access the application successfully. If you encounter any issues with logging in, accessing a form, or using any feature of the platform, please contact us using the details below.
                                            <br><br>
                                            We look forward to working with your team and supporting a smooth transition to the E-Logbook platform.
                                            <br><br>
                                            Best regards,<br>
                                            E-Logbook Support Team<br>
                                            +91 9037382416<br>
                                            <a href="mailto:gothoslabs@gmail.com" style="color: #184da1;">gothoslabs@gmail.com</a>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                                <!-- card bottom rounding -->
                                <tr>
                                  <td class="height-01" style="border-radius: 0 0 5px 5px; font-size: 1px; line-height: 1px; border-top: 1px solid #f0f4f7;" height="60" bgcolor="#ffffff">&nbsp;</td>
                                </tr>
                                <!-- footer -->
                                <tr>
                                  <td class="indent-04" style="padding: 40px 20px 60px;" valign="top">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                      <tbody>
                                        <tr>
                                          <td style="font: italic 10px/12px Arial, Helvetica, sans-serif; color: #939ca5; padding: 0 0 10px;" align="center">
                                            Improving record-keeping and data accuracy in medical education
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;

  await transporter.sendMail({
    from: `"E-LogBook" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your E-LogBook Account Has Been Created",
    text: textTemplate,
    html: htmlTemplate,
  });
};
