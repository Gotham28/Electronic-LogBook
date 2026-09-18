const fs = require('fs');

const rawMixpanelHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
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
      .n-link a {color: #5277ff !important; text-decoration: none !important;}
      .hover:hover {text-decoration: underline !important;}
      a img{border:none;}
      table td{mso-line-height-rule:exactly;}
      .ExternalClass, .ExternalClass a, .ExternalClass span, .ExternalClass b, .ExternalClass br, .ExternalClass p, .ExternalClass div{line-height:inherit;}
      .address { color: #939ca5 !important; background: none !important; text-decoration: none !important;}
      .address span, .address * { color: #939ca5 !important; text-decoration: none !important; border:none !important; cursor: auto !important; pointer-events: none; background: none !important;}
      .address a:hover {text-decoration: underline !important;}
      img{max-width: 100%; height: auto;}
      @media only screen and (max-width:500px) {
        table[class="flexible"]{width:100% !important;}
        table[class="table-center"]{float:none !important; margin:0 auto !important;}
        table[class="table-left"]{float:none !important; margin:0 auto 0 0 !important;}
        *[class="hide"]{display:none !important; width:0 !important; height:0 !important; padding:0 !important; font-size:0 !important; line-height:0 !important;}
        span[class="db"]{display:block !important;}
        td[class="image-m"]{display:table-cell !important;}
        td[class="image-m"] img{display:block !important; width:100% !important; height:auto !important;}
        td[class="img-flex"] img{width:100% !important; height:auto !important;}
        img[class="img-flex"]{width:100% !important; height:auto !important;}
        td[class="aligncenter"]{text-align:center !important;}
        td[class="alignleft"]{text-align:left !important;}
        tr[class="table-holder"]{display:table !important; width:100% !important;}
        th[class="tcap"]{display:table-caption !important; width:100% !important;}
        th[class="thead"]{display:table-header-group !important; width:100% !important;}
        th[class="trow"]{display:table-row !important; width:100% !important;}
        th[class="tfoot"]{display:table-footer-group !important; width:100% !important;}
        th[class="flex"]{display:block !important; width:100% !important; padding-left: 0 !important; padding-right: 0 !important; border-left: none !important; border-right: none !important;}
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
            <div style="display:none; white-space:nowrap; font:15px/1px courier;">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;
              &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;
              &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</div>
          </td>
        </tr>
        <tr>
          <td class="hide">
            <table width="630" cellpadding="0" cellspacing="0" style="width:630px !important;">
              <tbody>
                <tr><td style="min-width:630px; font-size:0; line-height:0;">&nbsp;</td></tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="#184da1" style="background-image: url('https://mixpanel.com/wp-content/uploads/2017/12/dc-linear-bg.jpg'); background-position: center bottom; background-repeat: repeat; background-size: auto 100%;" valign="top" align="center">
            <table class="flexible" style="margin: 0 auto;" width="630" align="center" cellpadding="0" cellspacing="0">
              <tbody>
                <tr>
                  <td style="padding: 0 15px;" valign="top">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tbody>
                        <tr>
                          <td class="indent-01" style="padding: 48px 20px 31px;" align="center" valign="top">
                            <div class="mktoImg" id="logo" mktoname="Logo image">
                              <!-- No logo image for now or use placeholder -->
                              <a style="text-decoration: none; color: #ffffff; font-size: 24px; font-weight: bold; font-family: Arial, sans-serif;">
                                E-LogBook
                              </a>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="box-shadow: 0 3px 13px rgba(0, 0, 0, 0.05); border-radius: 5px 5px 0 0; border-bottom: 1px solid #ffffff;" bgcolor="#ffffff" valign="top">
                            <table width="100%" cellspacing="0" cellpadding="0">
                              <tbody>
                                <tr>
                                  <td style="padding: 34px 20px 6px;" align="center" valign="top">
                                    <table class="flexible" style="margin: 0 auto;" align="center" width="476" cellpadding="0" cellspacing="0">
                                      <tbody>
                                        <tr>
                                          <td valign="top">
                                            <table class="mktoContainer" id="mkto-container" width="100%" cellpadding="0" cellspacing="0">
                                              <tbody>
                                                <tr class="mktoModule" id="date" mktoname="Date">
                                                  <td style="padding-bottom: 21px;" valign="top">
                                                    <table style="margin: 0 auto;" cellpadding="0" cellspacing="0" align="center">
                                                      <tbody>
                                                        <tr>
                                                          <td style="border-radius: 100px; font: bold 10px/13px Arial, Helvetica, Verdana, Helvetica, sans-serif; color: #68778d; text-transform: uppercase; mso-padding-top-alt: 6px; mso-padding-bottom-alt: 6px; mso-padding-left-alt: 18px; mso-padding-right-alt: 18px;" align="center" bgcolor="#edf1f3">
                                                            <div class="mktoText" id="date-txt" mktoname="Text">	<span style="display: block; padding-top: 6px; padding-bottom: 6px; padding-left: 18px; padding-right: 18px;">Welcome</span></div>
                                                          </td>
                                                        </tr>
                                                      </tbody>
                                                    </table>
                                                  </td>
                                                </tr>
                                                <tr class="mktoModule" id="main-heading" mktoname="Main heading">
                                                  <td class="indent-02" style="padding-bottom: 78px;" valign="top">
                                                    <table width="100%" cellpadding="0" cellspacing="0">
                                                      <tbody>
                                                        <tr>
                                                          <td class="heading" style="font: bold 28px/34px Arial, Helvetica, Verdana, Helvetica, sans-serif; color: #353d58;" align="center">
                                                            <div class="mktoText" id="main-heading-txt" mktoname="Text">Welcome to E-LogBook!</div>
                                                          </td>
                                                        </tr>
                                                      </tbody>
                                                    </table>
                                                  </td>
                                                </tr>
                                                <tr class="mktoModule" id="main-content-top-part" mktoname="Main content top part">
                                                  <td style="font: 16px/32px Arial, Helvetica, Verdana, Helvetica, sans-serif; color: #475171;">
                                                    <div class="mktoText" id="main-content-top-part-content" mktoname="Content">Dear \${fullName},
                                                      <br>
                                                      <br>We are pleased to inform you that your account for the E-Logbook Application has been successfully created.
                                                      <br>
                                                      <br>The E-Logbook is a secure digital platform designed to streamline record-keeping, improve data accuracy, and simplify daily logging, monitoring, and reporting. It replaces traditional paper-based logbooks with a centralized digital workflow that enables authorized users to record, review, and manage operational data efficiently.
                                                      <br>
                                                      <br><b>Your E-Logbook Account Credentials</b>
                                                      <br>
                                                      <br>Please use the following credentials to access the E-Logbook application:
                                                      <br>
                                                      <br>Username: <b>\${email}</b>
                                                      <br>Password: <code style="font-family: monospace; background: #f4f4f4; padding: 2px 4px;">\${password}</code>
                                                      <br>Application URL: <a href="\${process.env.APP_URL || 'https://www.elogbookgothos.in'}">\${process.env.APP_URL || 'https://www.elogbookgothos.in'}</a>
                                                      <br>
                                                      <br>For security purposes, please do not share your login credentials with others. We highly recommend changing your password after your first login.
                                                    </div>
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
                                  <td style="border-bottom: 8px solid #ffffff; font-size: 0; line-height: 0;" height="1px" bgcolor="#ffffff">&nbsp;</td>
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
        <tr>
          <td align="center" valign="top">
            <table class="flexible" style="margin: 0 auto;" width="630" align="center" cellpadding="0" cellspacing="0">
              <tbody>
                <tr>
                  <td style="padding: 0 15px;" valign="top">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tbody>
                        <tr>
                          <td class="indent-03" style="box-shadow: 0 15px 13px rgba(0, 0, 0, 0.05); border-top: 8px solid #ffffff; padding-bottom: 7px; font-size: 0; line-height: 0;" height="1px" bgcolor="#ffffff">&nbsp;</td>
                        </tr>
                        <tr>
                          <td valign="top">
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tbody>
                                <tr>
                                  <td style="box-shadow: 0 15px 13px rgba(0, 0, 0, 0.05); padding: 0 20px;" bgcolor="#ffffff" align="center" valign="top">
                                    <table class="flexible" style="margin: 0 auto;" align="center" width="476" cellpadding="0" cellspacing="0">
                                      <tbody>
                                        <tr>
                                          <td style="font: 16px/32px Arial, Helvetica, Verdana, Helvetica, sans-serif; color: #475171;">
                                            <div class="mktoText" id="main-content-bottom-part" mktoname="Main content bottom part"><b>Key Features</b>
                                              <br>
                                              <br>The E-Logbook platform provides:
                                              <br>
                                              <ul style="padding-left: 20px; margin-top: 0; margin-bottom: 20px;">
                                                <li><b>Centralized Digital Entry:</b> Record, update, and review operational data through mobile and desktop devices.</li>
                                                <li><b>Automated Audit Trails:</b> Maintain timestamped records to support accountability, traceability, and data integrity.</li>
                                                <li><b>Customizable Forms & Workflows:</b> Digital forms and workflows configured according to your department's specific requirements.</li>
                                                <li><b>Dashboards & Monitoring:</b> Access relevant operational information through structured dashboards and real-time visualizations.</li>
                                                <li><b>Instant Reporting:</b> Generate structured reports in PDF and Excel formats for review and documentation.</li>
                                              </ul>
                                              <br><b>Getting Started</b>
                                              <br>
                                              <br>Please log in using the credentials provided above and verify that you can access the application successfully. If you encounter any issues with logging in, accessing a form, or using any feature of the platform, please contact us using the details below.
                                              <br>
                                              <br>We look forward to working with your team and supporting a smooth transition to the E-Logbook platform.
                                              <br>
                                              <br>Best regards,
                                              <br>E-Logbook Support Team
                                              <br>+91 9037382416
                                              <br><a href="mailto:gothoslabs@gmail.com" style="color:#00B4FE; text-decoration:none;">gothoslabs@gmail.com</a>
                                            </div>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td class="height-01" style="box-shadow: 0 15px 13px rgba(0, 0, 0, 0.02); border-radius: 0 0 5px 5px; font-size: 1px; line-height: 1px; border-top: 1px solid #ffffff;" height="98" bgcolor="#ffffff">&nbsp;</td>
                                </tr>
                                <tr>
                                  <td class="indent-04" style="padding: 60px 20px 100px;" valign="top">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                      <tbody>
                                        <tr>
                                          <td style="font: italic 10px/12px Arial, Helvetica, Verdana, Helvetica, sans-serif; color: #939ca5; padding: 0 0 10px;" align="center">
                                            <div class="mktoText" id="footer-txt-1" mktoname="Footer text one">Improving record-keeping and data accuracy</div>
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

const mailerPath = 'artifacts/api-server/src/lib/mailer.ts';
let code = fs.readFileSync(mailerPath, 'utf8');

// The regex matches everything from '  const htmlTemplate = `' to '`;' just before '  await transporter.sendMail'
const regex = /const htmlTemplate = \`[\s\S]*?\`;/m;
code = code.replace(regex, 'const htmlTemplate = `' + rawMixpanelHtml + '`;');

fs.writeFileSync(mailerPath, code);
console.log('Successfully updated htmlTemplate in mailer.ts');
