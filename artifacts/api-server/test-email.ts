import { sendHODApprovalRequestEmail } from './src/lib/mailer.js';

sendHODApprovalRequestEmail(
  'salwansubair7@gmail.com',
  'Dr. Test HOD',
  'Jane Doe',
  'KUHS-2026-101',
  'Pediatrics'
).then(() => console.log('Successfully sent the email! Check your inbox.')).catch(console.error);
