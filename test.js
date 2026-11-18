// Automated Test Suite for Alumni Mentorship Portal
// Tests RBAC, Business Rules (BR-001..BR-018), Traceability API, and Health
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Ensure database is seeded
process.env.DB_FILE = path.join(__dirname, 'data', 'test.db');
process.env.JWT_SECRET = 'test-secret-123456';
process.env.DEMO = '1';
process.env.NODE_ENV = 'test';

const { seed } = require('./db');
seed(true);

const app = require('./server');
let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  try { fs.unlinkSync(process.env.DB_FILE); } catch(e) {}
  setTimeout(() => process.exit(0), 100);
});

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// Helper: login as user
async function login(email, password = 'demo123') {
  const r = await req('POST', '/api/login', { email, password });
  return r.data.token;
}

test('1. Health check endpoint returns ok and version', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.version, '2.0.0');
});

test('2. Authentication: valid login returns JWT (FR-004)', async () => {
  const token = await login('student@demo.com');
  assert.ok(token);
});

test('3. Authentication: invalid password fails without revealing detail (FR-005)', async () => {
  const r = await req('POST', '/api/login', { email: 'student@demo.com', password: 'wrong' });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'Invalid email or password.');
});

test('4. RBAC: Student cannot access coordinator verification queue (FR-009 / NFR-006)', async () => {
  const token = await login('student@demo.com');
  const r = await req('GET', '/api/verifications', null, token);
  assert.equal(r.status, 403);
});

test('5. RBAC: Coordinator can access verification queue', async () => {
  const token = await login('coord@demo.com');
  const r = await req('GET', '/api/verifications', null, token);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('6. BR-001: Unverified alumnus cannot create mentor profile', async () => {
  const token = await login('pending@demo.com');
  const r = await req('PUT', '/api/profile', { designation: 'Dev', org: 'Tech', domain: 'Web Development' }, token);
  assert.equal(r.status, 403);
  assert.match(r.data.error, /Only verified alumni/);
});

test('7. BR-003: Only authenticated student can send mentorship request', async () => {
  const mentorToken = await login('mentor@demo.com');
  const r = await req('POST', '/api/requests', { mid: 'm2', topic: 'Test', msg: 'Goal', slot: 'Mon 5pm' }, mentorToken);
  assert.equal(r.status, 403);
});

test('8. BR-004: Duplicate pending/accepted request to same mentor is blocked', async () => {
  const studentToken = await login('student@demo.com');
  // student@demo.com (s1) already has accepted request r1 with m1
  const r = await req('POST', '/api/requests', { mid: 'm1', topic: 'Another Request', msg: 'Help', slot: 'Tue 6pm' }, studentToken);
  assert.equal(r.status, 409);
  assert.match(r.data.error, /already have a pending or accepted request/);
});

test('9. BR-005: Student cannot exceed 3 pending requests', async () => {
  const studentToken = await login('student2@demo.com'); // s2 has 1 pending (r6) and 1 referred (r4)
  // Send 2 more pending requests to hit limit of 3
  await req('POST', '/api/requests', { mid: 'm3', topic: 'Req A', msg: 'Help A', slot: 'Slot A' }, studentToken);
  await req('POST', '/api/requests', { mid: 'm6', topic: 'Req B', msg: 'Help B', slot: 'Slot B' }, studentToken);
  // Attempt 4th pending request
  const r = await req('POST', '/api/requests', { mid: 'm5', topic: 'Req C', msg: 'Help C', slot: 'Slot C' }, studentToken);
  assert.equal(r.status, 409);
  assert.match(r.data.error, /cannot have more than 3 pending requests/);
});

test('10. BR-009: Declining request requires a reason', async () => {
  const mentorToken = await login('neha@demo.com'); // m2 has pending request r2
  const r = await req('POST', '/api/requests/r2/respond', { action: 'decline', reason: '' }, mentorToken);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /reason is required when declining/);
});

test('11. BR-010: Session can only be scheduled against accepted request', async () => {
  const mentorToken = await login('neha@demo.com'); // r2 is still pending
  const r = await req('POST', '/api/sessions', { rid: 'r2', date: '2026-12-01', time: '18:00', dur: 60, link: 'https://meet.google.com/xyz' }, mentorToken);
  assert.equal(r.status, 404);
  assert.match(r.data.error, /No accepted request found/);
});

test('12. BR-011: Session must be scheduled for future date and time', async () => {
  const mentorToken = await login('mentor@demo.com'); // r1 is accepted
  const r = await req('POST', '/api/sessions', { rid: 'r1', date: '2020-01-01', time: '10:00', dur: 60, link: 'https://meet.google.com/xyz' }, mentorToken);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /future date and time/);
});

test('13. BR-013: Feedback can only be submitted for completed sessions', async () => {
  const studentToken = await login('student3@demo.com'); // s3 is mentee for ses3 (Scheduled, not completed)
  const r = await req('POST', '/api/feedback', { sid: 'ses3', rating: 5, comment: 'Nice' }, studentToken);
  assert.equal(r.status, 409);
  assert.match(r.data.error, /Feedback is only allowed for completed sessions/);
});

test('14. BR-014: Rating must be an integer between 1 and 5', async () => {
  const studentToken = await login('student@demo.com');
  const r = await req('POST', '/api/feedback', { sid: 'ses1', rating: 6, comment: 'Great' }, studentToken);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Rating must be an integer from 1 to 5/);
});

test('15. BR-015: Aggregate rating is hidden if fewer than 3 ratings', async () => {
  const studentToken = await login('student@demo.com');
  const r = await req('GET', '/api/mentors', null, studentToken);
  assert.equal(r.status, 200);
  const m1 = r.data.find(m => m.uid === 'm1');
  assert.ok(m1);
  // m1 has 2 ratings seeded (fb1 and fb2), so rating should be null per BR-015
  assert.equal(m1.rating, null);
});

test('16. BR-017 & BR-018: Only admin can toggle user active status and deactivated user cannot log in', async () => {
  const adminToken = await login('admin@demo.com');
  // Deactivate s2
  const r = await req('POST', '/api/users/s2/toggle', null, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);

  // Try to log in as s2
  const loginRes = await req('POST', '/api/login', { email: 'student2@demo.com', password: 'demo123' });
  assert.equal(loginRes.status, 403);
  assert.match(loginRes.data.error, /Account deactivated/);

  // Reactivate s2
  await req('POST', '/api/users/s2/toggle', null, adminToken);
});

test('17. Traceability: GET /api/trace/matrix returns 100% requirements', async () => {
  const adminToken = await login('admin@demo.com');
  const r = await req('GET', '/api/trace/matrix', null, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.data.summary.totalFR, 61);
  assert.equal(r.data.summary.totalNFR, 24);
  assert.equal(r.data.summary.totalBR, 18);
  assert.equal(r.data.summary.totalUC, 20);
  assert.equal(r.data.summary.uncoveredReqs.length, 0);
});

test('18. Traceability: GET /api/trace/screen/mentor-discovery returns FR, BR, UC', async () => {
  const studentToken = await login('student@demo.com');
  const r = await req('GET', '/api/trace/screen/mentor-discovery', null, studentToken);
  assert.equal(r.status, 200);
  assert.ok(r.data.frs.length > 0);
  assert.ok(r.data.brs.length > 0);
  assert.ok(r.data.usecases.length > 0);
});

test('19. Traceability: POST /api/trace/event logs shortcut event', async () => {
  const studentToken = await login('student@demo.com');
  const r = await req('POST', '/api/trace/event', { keyCombo: 'Alt+F', action: 'TOGGLE_FR', screenId: 'mentor-discovery' }, studentToken);
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.ok(r.data.id);
});

test('20. Demo: Next role cycling endpoint works in DEMO mode', async () => {
  const r = await req('POST', '/api/demo/next-role', { currentRole: 'student' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'alumnus');
});
