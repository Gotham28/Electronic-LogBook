const BASE = 'http://localhost:3000/api';

async function req(path, token) {
  const r = await fetch(BASE + path, { headers: { Cookie: 'token=' + token } });
  return { status: r.status, data: await r.json() };
}

async function run() {
  const lr = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({username:'aravind@elogbook.com', password:'password123'})
  });
  const cookie = lr.headers.get('set-cookie');
  const token = cookie.match(/token=([^;]+)/)[1];

  console.log('=== /logs response ===');
  const logs = await req('/students/14/logs', token);
  console.log('status:', logs.status);
  const d = logs.data;
  console.log('profile:', JSON.stringify(d.profile));
  console.log('caseLogs count:', d.caseLogs?.length, '| first:', JSON.stringify(d.caseLogs?.[0]));
  console.log('procedureLogs count:', d.procedureLogs?.length, '| first:', JSON.stringify(d.procedureLogs?.[0]));
  console.log('academicLogs count:', d.academicLogs?.length, '| first:', JSON.stringify(d.academicLogs?.[0]));

  console.log('\n=== /thesis response ===');
  const thesis = await req('/students/14/thesis', token);
  console.log('status:', thesis.status);
  console.log('data:', JSON.stringify(thesis.data));

  console.log('\n=== /procedures (expect 404) ===');
  const p = await req('/students/14/procedures', token);
  console.log('status:', p.status);

  console.log('\n=== /academics (expect 404) ===');
  const a = await req('/students/14/academics', token);
  console.log('status:', a.status);
}
run().catch(console.error);
