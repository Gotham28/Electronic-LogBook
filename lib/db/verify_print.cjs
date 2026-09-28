// Step 6: End-to-end verification — mirrors exactly what PrintableLogbook.tsx fetches
const BASE = 'http://localhost:3000/api';

async function get(path, token) {
  const r = await fetch(BASE + path, { headers: { Cookie: 'token=' + token } });
  const data = await r.json();
  return { status: r.status, data };
}

async function run() {
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({username:'aravind@elogbook.com', password:'password123'})
  });
  const token = lr.headers.get('set-cookie').match(/token=([^;]+)/)[1];
  const ID = 14;

  const [logsR, postingsR, leavesR, assessR, thesisR] = await Promise.all([
    get(`/students/${ID}/logs`, token),
    get(`/students/${ID}/postings`, token),
    get(`/students/${ID}/leave-records`, token),
    get(`/students/${ID}/assessments`, token),
    get(`/students/${ID}/thesis`, token),
  ]);

  const logs = logsR.data;
  console.log('=== HEADER ===');
  console.log('profile:', JSON.stringify(logs.profile));

  console.log('\n=== 1. Postings ===');
  const postings = postingsR.data.data || [];
  console.log('count:', postings.length);
  postings.forEach(p => console.log(' -', p.ward, '|', p.startDate, '->', p.endDate));

  console.log('\n=== 2. Case Logs ===');
  const cases = logs.caseLogs || [];
  console.log('count:', cases.length);
  cases.forEach(c => console.log(' -', c.date, '|', c.diagnosisFinal || c.diagnosisProvisional, '|', c.status));

  console.log('\n=== 3. Procedure Logs ===');
  const procs = logs.procedureLogs || [];
  console.log('count:', procs.length);
  procs.forEach(p => console.log(' -', p.date, '|', p.procedureName, '| competencyLevel:', p.competencyLevel, '|', p.status));

  console.log('\n=== 4. Academic Activities ===');
  const acads = logs.academicLogs || [];
  console.log('count:', acads.length);
  acads.forEach(a => console.log(' -', a.date, '|', a.activityType, '|', a.topic, '|', a.status));

  console.log('\n=== 5. Assessments ===');
  const assessments = Array.isArray(assessR.data) ? assessR.data : [];
  console.log('count:', assessments.length);
  assessments.forEach(a => console.log(' -', a.date, '|', a.examName, '|', a.marks, '/', a.maximum));

  console.log('\n=== 6. Leave Records ===');
  const leaves = Array.isArray(leavesR.data) ? leavesR.data : [];
  console.log('count:', leaves.length);
  leaves.forEach(l => {
    const days = l.startDate && l.endDate
      ? Math.ceil((new Date(l.endDate) - new Date(l.startDate)) / (1000*60*60*24)) + 1
      : '?';
    console.log(' -', l.leaveType, '|', l.startDate, '->', l.endDate, '| days:', days, '|', l.status);
  });

  console.log('\n=== 7. Thesis ===');
  const thesis = thesisR.data?.data;
  if (thesis) {
    console.log(' thesisTitle:', thesis.thesisTitle);
    console.log(' protocolStatus:', thesis.protocolStatus);
    console.log(' midTermStatus:', thesis.midTermStatus);
    console.log(' finalSubmissionStatus:', thesis.finalSubmissionStatus);
    console.log(' publicationProofUrl:', thesis.publicationProofUrl);
  } else {
    console.log(' No thesis record for this student.');
  }
}
run().catch(console.error);
