import nodemailer from 'nodemailer';
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD } });
const html = `<p style="margin:0; font-size:22px; font-weight:bold; color:#0f172a;">Action Required: Pending Student Approval</p>
     <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#475569;">Dear Dr. Smith,</p>
     <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#475569;">A new student, <strong>Jane Doe</strong> (Reg No: KUHS-2026-101), has registered for the Pediatrics department and is awaiting your approval.</p>

     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 12px;">
       <tr>
         <td style="background-color:#0f766e;">
           <a href="https://elogbookgothos.in/student-access" style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#ffffff; text-decoration:none;">Review Registration</a>
         </td>
       </tr>
     </table>
     <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#475569;">Please log in and go to the Student Access tab in your portal to approve or deny the request.</p>`;
transporter.sendMail({ from: process.env.EMAIL_USER, to: 'salwansubair7@gmail.com', subject: 'Action Required: Pending Student Approval', html }).then(() => console.log('Sent!')).catch(console.error);
