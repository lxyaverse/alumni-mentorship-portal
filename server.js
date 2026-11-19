// Alumni Mentorship Portal — Server (CS314, Team T069, LNMIIT)
// Extends original with: Traceability API, SSE, Helmet, rate-limit, health, demo-reset, graceful shutdown
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 3000;
const DEMO = process.env.DEMO === '1';

// ---- Security middleware (NFR-004, NFR-006) ----
app.use(helmet({ contentSecurityPolicy: false })); // CSP off for inline styles in SPA
app.use(express.json({ limit: '50kb' }));

// Rate limiting (NFR-004 / NFR-006)
const limiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.', code: 'RATE_LIMITED' } });
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, message: { error: 'Too many login attempts.', code: 'RATE_LIMITED' } });
app.use('/api', limiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// ---- Request logging ----
app.use((req, _res, next) => { if (process.env.NODE_ENV !== 'test') console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next(); });

// ---- Helpers ----
const now = () => Date.now();
const DAY = 864e5;
const nid = p => p + Math.random().toString(36).slice(2, 10);
const bad = (s, m, c = 400, code) => s.status(c).json({ error: m, code: code || (c === 400 ? 'BAD_REQUEST' : c === 401 ? 'UNAUTHORIZED' : c === 403 ? 'FORBIDDEN' : c === 404 ? 'NOT_FOUND' : 'SERVER_ERROR') });
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const qa = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const note = (u, m) => run('INSERT INTO notes VALUES(?,?,?,0,?)', nid('n'), u, m, now());
const audit = (actor, a) => run('INSERT INTO audit VALUES(?,?,?)', now(), actor, a);
const rating = m => { const r = q1('SELECT AVG(rating) a,COUNT(*) c FROM feedback WHERE mid=?', m); return r.c >= 3 ? +r.a.toFixed(1) : null; }; // BR-015
const taken = m => q1("SELECT COUNT(*) c FROM requests WHERE mid=? AND status='Accepted'", m).c;
const expire = () => qa("SELECT * FROM requests WHERE status='Pending' AND created<?", now() - 7 * DAY).forEach(r => { // FR-037 / BR-008
  run("UPDATE requests SET status='Expired' WHERE id=?", r.id);
  note(r.sid, `Your request "${r.topic}" expired (no response in 7 days).`);
});
setInterval(expire, 60000);

// ---- Auth middleware (FR-009, NFR-006 server-side RBAC) ----
const auth = (...roles) => (req, res, next) => {
  let u;
  try {
    const bearer = (req.headers.authorization || '').startsWith('Bearer ')
      ? (req.headers.authorization || '').slice(7)
      : String(req.query?.token || '');
    u = q1('SELECT * FROM users WHERE id=?', jwt.verify(bearer, SECRET).id);
  }
  catch { return bad(res, 'Not authenticated', 401); }
  if (!u || !u.active) return bad(res, 'Account inactive', 401);
  if (roles.length && !roles.includes(u.role)) return bad(res, 'Forbidden', 403); // FR-009 / NFR-006
  req.u = u; expire(); next();
};
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, why: u.why });
const wrap = f => (req, res) => { try { f(req, res); } catch (e) { console.error(e); bad(res, 'Server error', 500); } };

// ---- Health check ----
app.get('/api/health', (req, res) => res.json({ ok: true, ts: now(), demo: DEMO, version: '2.0.0' }));

// ---- SSE client registry (for /api/trace/stream) ----
const sseClients = new Set();
function pushSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => { try { c.write(payload); } catch { sseClients.delete(c); } });
}

// =====================================================================
//  PART A — EXISTING ROUTES (preserved verbatim, tagged for traceability)
// =====================================================================

// ---- Auth ----
app.post('/api/register', wrap((req, res) => { // FR-001, FR-002, UC-001
  const { name, email, password, role, grad, degree, org } = req.body || {};
  if (!name || !email || !password) return bad(res, 'Name, email and password are required.');
  if (password.length < 6) return bad(res, 'Password must be at least 6 characters.');
  if (!['student', 'alumnus'].includes(role)) return bad(res, 'Role must be student or alumnus.');
  if (role === 'alumnus' && (!grad || !String(degree || '').trim() || !String(org || '').trim()))
    return bad(res, 'Graduation year, degree and current organization are required for alumni registration.');
  if (q1('SELECT 1 FROM users WHERE email=?', email.toLowerCase())) return bad(res, 'Email already registered.', 409);
  run('INSERT INTO users(id,name,email,pw,role,status,grad,degree,org) VALUES(?,?,?,?,?,?,?,?,?)',
    nid('u'), name.trim(), email.toLowerCase().trim(), bcrypt.hashSync(password, 10), role,
    role === 'alumnus' ? 'pending' : null, grad || null, degree || null, org || null); // FR-002
  res.json({ ok: true });
}));

app.post('/api/login', wrap((req, res) => { // FR-004, FR-005, UC-003
  const u = q1('SELECT * FROM users WHERE email=?', String(req.body?.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body?.password || ''), u.pw)) return bad(res, 'Invalid email or password.', 401); // FR-005
  if (!u.active) return bad(res, 'Account deactivated.', 403); // BR-018
  res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '8h' }), user: pub(u) }); // NFR-008
}));

// ---- Account settings & password recovery ----
app.get('/api/account', auth(), (req, res) => {
  res.json({ id: req.u.id, name: req.u.name, email: req.u.email, role: req.u.role });
});

app.patch('/api/account', auth(), wrap((req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return bad(res, 'Name is required.');
  run('UPDATE users SET name=? WHERE id=?', name, req.u.id);
  res.json({ ok: true, name });
}));

app.post('/api/account/password', auth(), wrap((req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!bcrypt.compareSync(currentPassword, req.u.pw)) {
    return bad(res, 'Current password is incorrect.', 401);
  }
  if (newPassword.length < 6) return bad(res, 'New password must be at least 6 characters.');
  run('UPDATE users SET pw=? WHERE id=?', bcrypt.hashSync(newPassword, 10), req.u.id);
  res.json({ ok: true, message: 'Password changed successfully.' });
}));

app.post('/api/forgot-password', wrap((req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = q1('SELECT * FROM users WHERE email=?', email);
  const response = { ok: true, message: 'If the account exists, a reset link was sent.' };

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    run('DELETE FROM password_reset_tokens WHERE user_id=?', user.id);
    run('INSERT INTO password_reset_tokens(token_hash,user_id,expires) VALUES(?,?,?)',
      tokenHash, user.id, now() + 30 * 60 * 1000);
    run('INSERT INTO email_outbox(id,to_email,subject,body,sent,created) VALUES(?,?,?,?,0,?)',
      nid('e'), user.email, 'Password reset', `Password reset token: ${token}`, now());
    if (DEMO) response.demoToken = token;
  }

  res.json(response);
}));

app.post('/api/reset-password', wrap((req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  if (!token || password.length < 6) {
    return bad(res, 'A valid token and password of at least 6 characters are required.');
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = q1('SELECT * FROM password_reset_tokens WHERE token_hash=? AND used=0', tokenHash);
  if (!row || row.expires < now()) return bad(res, 'Reset link is invalid or expired.');

  db.transaction(() => {
    run('UPDATE users SET pw=? WHERE id=?', bcrypt.hashSync(password, 10), row.user_id);
    run('UPDATE password_reset_tokens SET used=1 WHERE token_hash=?', tokenHash);
  })();
  res.json({ ok: true, message: 'Password updated successfully.' });
}));

app.get('/api/me', auth(), (req, res) => res.json(pub(req.u)));
app.get('/api/cats', auth(), (req, res) => res.json(qa('SELECT name FROM cats ORDER BY name').map(c => c.name))); // FR-060

// ---- Mentor profile & discovery (FR-011..FR-023) ----
app.get('/api/profile', auth('alumnus'), (req, res) => res.json(q1('SELECT * FROM profiles WHERE uid=?', req.u.id) || {}));
app.put('/api/profile', auth('alumnus'), wrap((req, res) => { // FR-011, FR-012, FR-013, BR-001
  if (req.u.status !== 'verified') return bad(res, 'Only verified alumni can create a mentor profile.', 403); // BR-001
  const b = req.body || {};
  const avail = ['Available', 'Limited', 'Unavailable'].includes(b.avail) ? b.avail : 'Available'; // FR-014
  const complete = !!(String(b.designation || '').trim() && String(b.org || '').trim() &&
    String(b.industry || '').trim() && String(b.domain || '').trim() &&
    String(b.expertise || '').trim() && String(b.intro || '').trim() &&
    (+b.years >= 0) && (+b.grad > 0));
  run('INSERT OR REPLACE INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    req.u.id, b.designation, b.org, b.industry, b.domain, b.expertise,
    +b.years || 0, +b.grad || null, b.intro, avail, Math.max(1, +b.cap || 1), // FR-015
    complete ? 1 : 0);
  res.json({ ok: true });
}));

app.get('/api/mentors', auth('student', 'alumnus', 'coordinator', 'admin'), (req, res) => { // FR-016, FR-018, FR-019, FR-020, FR-021, BR-002, BR-016
  const { s = '', d = '', a = '', o = 'rating' } = req.query;
  let l = qa("SELECT p.*,u.name FROM profiles p JOIN users u ON u.id=p.uid WHERE u.status='verified' AND u.active=1 AND p.complete=1") // FR-016, BR-002
    .filter(p => (!s || [p.domain, p.industry, p.org, p.expertise].join(' ').toLowerCase().includes(s.toLowerCase())) && // FR-019
                 (!d || p.domain === d) && (!a || p.avail === a)) // FR-020
    .map(p => ({ uid: p.uid, name: p.name, designation: p.designation, org: p.org, industry: p.industry, domain: p.domain,
      expertise: p.expertise, years: p.years, grad: p.grad, intro: p.intro, avail: p.avail, cap: p.cap,
      rating: rating(p.uid), taken: taken(p.uid) })); // FR-049, BR-015 (no contact details - BR-016)
  const ord = { rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1), years: (a, b) => b.years - a.years, // FR-021
    avail: (a, b) => ['Available','Limited','Unavailable'].indexOf(a.avail) - ['Available','Limited','Unavailable'].indexOf(b.avail) };
  l.sort(ord[o] || ord.rating);
  res.json(l);
});

app.get('/api/mentor/:id', auth(), (req, res) => { // FR-022, BR-016
  const p = q1("SELECT p.*,u.name FROM profiles p JOIN users traceabu ON u.id=p.uid WHERE p.uid=? AND u.status='verified' AND p.complete=1", req.params.id);
  if (!p) return bad(res, 'Mentor not found', 404);
  res.json({ uid: p.uid, name: p.name, designation: p.designation, org: p.org, industry: p.industry, domain: p.domain,
    expertise: p.expertise, years: p.years, grad: p.grad, intro: p.intro, avail: p.avail, cap: p.cap,
    rating: rating(p.uid), taken: taken(p.uid) }); // No personal contact details (BR-016)
});

// ---- Requests (FR-024..FR-038) ----
app.post('/api/requests', auth('student'), wrap((req, res) => { // FR-024, FR-025, BR-003, BR-004, BR-005, UC-009
  const { mid, topic, msg, slot, domain } = req.body || {};
  if (!mid || !topic?.trim() || !msg?.trim() || !slot?.trim()) return bad(res, 'Topic, message and preferred time slot are required.');
  const mentor = q1("SELECT p.*,u.status FROM profiles p JOIN users u ON u.id=p.uid WHERE p.uid=?", mid);
  if (!mentor || mentor.status !== 'verified' || !mentor.complete) return bad(res, 'Mentor not found or not visible.', 404); // FR-016
  if (q1("SELECT 1 FROM requests WHERE sid=? AND mid=? AND status IN('Pending','Accepted')", req.u.id, mid)) // BR-004 / FR-026
    return bad(res, 'You already have a pending or accepted request with this mentor.', 409);
  if (q1("SELECT COUNT(*) c FROM requests WHERE sid=? AND status='Pending'", req.u.id).c >= 3) // BR-005 / FR-027
    return bad(res, 'You cannot have more than 3 pending requests at the same time.', 409);
  const id = nid('r');
  run('INSERT INTO requests(id,sid,mid,topic,domain,msg,slot,status,created) VALUES(?,?,?,?,?,?,?,?,?)',
    id, req.u.id, mid, topic.trim(), domain || '', msg.trim(), slot.trim(), 'Pending', now());
  note(mid, `New mentorship request from ${req.u.name}: ${topic.trim()}.`); // FR-051
  res.json({ ok: true, id });
}));

app.get('/api/requests', auth(), (req, res) => { // FR-029, FR-030
  const isStu = req.u.role === 'student';
  if (isStu) {
    const l = qa('SELECT r.*,u.name other FROM requests r JOIN users u ON u.id=r.mid WHERE r.sid=? ORDER BY r.created DESC', req.u.id);
    return res.json(l.map(r => ({ ...r, sessions: q1('SELECT COUNT(*) c FROM sessions WHERE rid=?', r.id)?.c || 0 })));
  }
  if (req.u.role === 'alumnus') {
    const l = qa('SELECT r.*,u.name other FROM requests r JOIN users u ON u.id=r.sid WHERE r.mid=? ORDER BY r.created DESC', req.u.id);
    return res.json(l.map(r => ({ ...r, sessions: q1('SELECT COUNT(*) c FROM sessions WHERE rid=?', r.id)?.c || 0 })));
  }
  bad(res, 'Forbidden', 403);
});

app.post('/api/requests/:id/withdraw', auth('student'), wrap((req, res) => { // FR-028, UC-011
  const r = q1("SELECT * FROM requests WHERE id=? AND sid=? AND status='Pending'", req.params.id, req.u.id);
  if (!r) return bad(res, 'Request not found or not withdrawable.', 404);
  run("UPDATE requests SET status='Withdrawn',responded=? WHERE id=?", now(), r.id);
  note(r.mid, `A pending request has been withdrawn by ${req.u.name}.`);
  res.json({ ok: true });
}));

app.post('/api/requests/:id/respond', auth('alumnus'), wrap((req, res) => { // FR-032, FR-033, FR-034, FR-035, BR-006, BR-008, BR-009, UC-012
  const r = q1("SELECT * FROM requests WHERE id=? AND mid=? AND status='Pending'", req.params.id, req.u.id);
  if (!r) return bad(res, 'Request not found, not yours, or already answered.', 404);
  if (now() - r.created > 7 * DAY) { run("UPDATE requests SET status='Expired' WHERE id=?", r.id); return bad(res, 'This request has expired.', 409); } // BR-008
  const { action, reason } = req.body || {};
  if (!['accept','decline','refer'].includes(action)) return bad(res, 'Action must be accept, decline or refer.');
  if (action === 'decline' && !reason?.trim()) return bad(res, 'A reason is required when declining.'); // BR-009 / FR-034
  if (action === 'accept') {
    const p = q1('SELECT * FROM profiles WHERE uid=?', req.u.id);
    if (taken(req.u.id) >= (p?.cap || 1)) return bad(res, 'You have reached your mentoring capacity.', 409); // BR-006 / FR-032
  }
  const status = { accept: 'Accepted', decline: 'Declined', refer: 'Referred' }[action];
  const respondTx = db.transaction(() => {
    if (action === 'accept') {
      const p = q1('SELECT * FROM profiles WHERE uid=?', req.u.id);
      if (taken(req.u.id) >= (p?.cap || 1))
        throw new Error('MENTOR_CAPACITY');
    }
    run('UPDATE requests SET status=?,responded=?,reason=? WHERE id=?', status, now(), reason?.trim() || null, r.id);
  });
  try { respondTx(); } catch (e) {
    if (e.message === 'MENTOR_CAPACITY') return bad(res, 'You have reached your mentoring capacity.', 409);
    throw e;
  }
  if (action === 'accept') run('INSERT OR IGNORE INTO audit VALUES(?,?,?)', now(), req.u.name, `Accepted request from ${r.sid}`); // FR-038
  note(r.sid, `Your request "${r.topic}" was ${status.toLowerCase()}${reason ? '. Reason: ' + reason : ''}.`); // FR-052
  res.json({ ok: true });
}));

// ---- Sessions (FR-039..FR-045) ----
app.post('/api/sessions', auth('alumnus'), wrap((req, res) => { // FR-039, FR-040, BR-010, BR-011, UC-015
  const { rid, date, time, dur, link } = req.body || {};
  if (!rid || !date || !time || !link) return bad(res, 'Date, time and meeting link are required.');
  const r = q1("SELECT * FROM requests WHERE id=? AND mid=? AND status='Accepted'", rid, req.u.id);
  if (!r) return bad(res, 'No accepted request found.', 404); // BR-010
  const when = new Date(date + 'T' + time).getTime();
  if (isNaN(when) || when <= now()) return bad(res, 'Session must be scheduled for a future date and time.'); // BR-011
  const duration = Number(dur);
  if (!Number.isInteger(duration) || duration < 15 || duration > 480)
    return bad(res, 'Duration must be between 15 and 480 minutes.');
  const id = nid('s');
  run('INSERT INTO sessions(id,rid,date,time,dur,link,status) VALUES(?,?,?,?,?,?,?)', id, rid, date, time, duration, link, 'Scheduled');
  note(r.sid, `A session has been scheduled with ${req.u.name} on ${date} at ${time}.`); // FR-053
  res.json({ ok: true, id });
}));

app.get('/api/sessions', auth(), (req, res) => { // FR-043, FR-045, UC-016
  if (req.u.role === 'student') {
    const l = qa("SELECT ses.*,req.mid,req.sid,req.topic,u.name mentor FROM sessions ses JOIN requests req ON req.id=ses.rid JOIN users u ON u.id=req.mid WHERE req.sid=? ORDER BY ses.date DESC,ses.time DESC", req.u.id);
    return res.json(l.map(s => ({ ...s, hasFeedback: !!q1('SELECT 1 FROM feedback WHERE sid=? AND stu=?', s.id, req.u.id) })));
  }
  if (req.u.role === 'alumnus') {
    const l = qa("SELECT ses.*,req.mid,req.sid,req.topic,u.name student FROM sessions ses JOIN requests req ON req.id=ses.rid JOIN users u ON u.id=req.sid WHERE req.mid=? ORDER BY ses.date DESC,ses.time DESC", req.u.id);
    return res.json(l);
  }
  if (['coordinator','admin'].includes(req.u.role)) {
    return res.json(qa("SELECT ses.*,req.mid,req.sid,req.topic FROM sessions ses JOIN requests req ON req.id=ses.rid ORDER BY ses.date DESC LIMIT 100"));
  }
  bad(res, 'Forbidden', 403);
});

app.post('/api/sessions/:id/complete', auth('alumnus'), wrap((req, res) => { // FR-044, BR-012, UC-017
  const s = q1("SELECT * FROM sessions WHERE id=? AND status='Scheduled'", req.params.id);
  if (!s) return bad(res, 'Session not found or not scheduled.', 404);
  const r = q1('SELECT * FROM requests WHERE id=?', s.rid);
  if (!r || r.mid !== req.u.id) return bad(res, 'Forbidden', 403);
  if (!DEMO) {
    const when = new Date(s.date + 'T' + s.time).getTime() + (s.dur || 60) * 60000;
    if (now() < when) return bad(res, 'Session cannot be marked complete before its scheduled end time.'); // BR-012
  }
  run("UPDATE sessions SET status='Completed' WHERE id=?", s.id);
  note(r.sid, `Your session on ${s.date} has been marked completed. Please submit your feedback!`); // FR-055
  res.json({ ok: true });
}));

app.post('/api/sessions/:id/cancel', auth(), wrap((req, res) => { // FR-042, UC-016
  const s = q1("SELECT * FROM sessions WHERE id=? AND status='Scheduled'", req.params.id);
  if (!s) return bad(res, 'Session not found or not scheduled.', 404);
  const r = q1('SELECT * FROM requests WHERE id=?', s.rid);
  if (!r || (r.mid !== req.u.id && r.sid !== req.u.id)) return bad(res, 'Forbidden', 403);
  const reason = req.body?.reason?.trim();
  if (!reason) return bad(res, 'A cancellation reason is required.');
  run("UPDATE sessions SET status='Cancelled',reason=? WHERE id=?", reason, s.id);
  const other = r.mid === req.u.id ? r.sid : r.mid;
  note(other, `A session on ${s.date} was cancelled. Reason: ${reason}`); // FR-053
  res.json({ ok: true });
}));

app.post('/api/sessions/:id/reschedule', auth(), wrap((req, res) => { // FR-041, UC-016
  const s = q1("SELECT * FROM sessions WHERE id=? AND status='Scheduled'", req.params.id);
  if (!s) return bad(res, 'Session not found or not scheduled.', 404);
  const r = q1('SELECT * FROM requests WHERE id=?', s.rid);
  if (!r || (r.mid !== req.u.id && r.sid !== req.u.id)) return bad(res, 'Forbidden', 403);
  const { date, time, link } = req.body || {};
  if (!date || !time) return bad(res, 'Date and time are required.');
  const when = new Date(date + 'T' + time).getTime();
  if (isNaN(when) || when <= now()) return bad(res, 'Rescheduled session must be in the future.'); // BR-011
  run('UPDATE sessions SET date=?,time=?,link=? WHERE id=?', date, time, link || s.link, s.id);
  const other = r.mid === req.u.id ? r.sid : r.mid;
  note(other, `A session has been rescheduled to ${date} at ${time}.`); // FR-053
  res.json({ ok: true });
}));

// Demo only: fast-forward a session's end time
if (DEMO) {
  app.post('/api/sessions/:id/fastforward', auth('alumnus'), wrap((req, res) => {
    const s = q1("SELECT ses.* FROM sessions ses JOIN requests r ON r.id=ses.rid WHERE ses.id=? AND r.mid=?", req.params.id, req.u.id);
    if (!s) return bad(res, 'Session not found', 404);
    if (s.status !== 'Scheduled') return bad(res, 'Session is not scheduled.', 409);
    run("UPDATE sessions SET date=?,time=? WHERE id=?", new Date(now() - 7200000).toISOString().slice(0,10), '00:00', s.id);
    res.json({ ok: true });
  }));
}

// ---- Feedback (FR-046..FR-050) ----
app.post('/api/feedback', auth('student'), wrap((req, res) => { // FR-046, FR-047, FR-048, BR-013, BR-014, UC-018
  const { sid, rating: v, comment } = req.body || {};
  const s = q1('SELECT * FROM sessions WHERE id=?', sid);
  if (!s) return bad(res, 'Session not found.', 404);
  const r = q1('SELECT * FROM requests WHERE id=?', s.rid);
  if (!r || r.sid !== req.u.id) return bad(res, 'You are not the student for this session.', 403); // AC-17
  if (s.status !== 'Completed') return bad(res, 'Feedback is only allowed for completed sessions (BR-013).', 409); // BR-013
  if (!Number.isInteger(v) || v < 1 || v > 5) return bad(res, 'Rating must be an integer from 1 to 5 (BR-014).'); // BR-014
  if (q1('SELECT 1 FROM feedback WHERE sid=? AND stu=?', sid, req.u.id)) return bad(res, 'Feedback already submitted for this session.', 409); // FR-048
  run('INSERT INTO feedback VALUES(?,?,?,?,?,?,?)', nid('f'), sid, req.u.id, r.mid, v, (comment || '').slice(0, 1000), now()); // FR-050 (comment stored but visibility controlled)
  note(r.mid, 'You received new session feedback.'); // FR-050
  res.json({ ok: true });
}));

// ---- Notifications (FR-051..FR-056) ----
app.get('/api/notifications', auth(), (req, res) => { // FR-056
  const l = qa('SELECT * FROM notes WHERE uid=? ORDER BY t DESC LIMIT 100', req.u.id);
  run('UPDATE notes SET read=1 WHERE uid=?', req.u.id);
  res.json(l);
});
app.get('/api/notifications/count', auth(), (req, res) => res.json({ unread: q1('SELECT COUNT(*) c FROM notes WHERE uid=? AND read=0', req.u.id).c }));

// ---- Coordinator / Admin (FR-057..FR-061) ----
const staff = ['coordinator', 'admin'];
app.get('/api/verifications', auth(...staff), (req, res) => // FR-058, UC-002
  res.json(qa("SELECT id,name,email,grad,degree,org FROM users WHERE role='alumnus' AND status='pending'")));

app.post('/api/verifications/:id', auth(...staff), wrap((req, res) => { // FR-003, NFR-023, UC-002
  const u = q1("SELECT * FROM users WHERE id=? AND role='alumnus'", req.params.id);
  if (!u) return bad(res, 'Not found', 404);
  const ok = !!req.body?.ok;
  if (!ok && !req.body?.reason?.trim()) return bad(res, 'A reason is required when rejecting.');
  run('UPDATE users SET status=?,why=? WHERE id=?', ok ? 'verified' : 'rejected', ok ? null : req.body.reason.trim(), u.id);
  audit(req.u.name, `${ok ? 'Verified' : 'Rejected'} alumnus ${u.name}`); // NFR-023
  res.json({ ok: true });
}));

app.get('/api/requests/referred', auth(...staff), (req, res) => // FR-035, FR-036, UC-014
  res.json(qa("SELECT r.*,u.name student FROM requests r JOIN users u ON u.id=r.sid WHERE r.status IN('Referred','Expired') ORDER BY created DESC")));

app.post('/api/requests/:id/reassign', auth('coordinator'), wrap((req, res) => { // FR-036, NFR-023, UC-014
  const r = q1("SELECT * FROM requests WHERE id=? AND status IN('Referred','Expired')", req.params.id);
  const m = q1("SELECT * FROM profiles p JOIN users u ON u.id=p.uid WHERE p.uid=? AND u.status='verified' AND p.avail!='Unavailable'", req.body?.mid);
  if (!r || !m) return bad(res, 'Invalid request or mentor.', 404);
  run("UPDATE requests SET mid=?,status='Pending',created=?,reason=NULL WHERE id=?", m.uid, now(), r.id);
  note(m.uid, 'A request has been reassigned to you.');
  note(r.sid, 'Your request was reassigned to a new mentor.');
  audit(req.u.name, `Reassigned request "${r.topic}"`); // NFR-023
  res.json({ ok: true });
}));

app.get('/api/stats', auth(...staff), (req, res) => { // FR-059, UC-020
  const c = sql => q1(sql).c;
  res.json({
    students: c("SELECT COUNT(*) c FROM users WHERE role='student'"),
    mentors: c("SELECT COUNT(*) c FROM users WHERE status='verified'"),
    pending: c("SELECT COUNT(*) c FROM requests WHERE status='Pending'"),
    accepted: c("SELECT COUNT(*) c FROM requests WHERE status='Accepted'"),
    scheduled: c("SELECT COUNT(*) c FROM sessions WHERE status='Scheduled'"),
    completed: c("SELECT COUNT(*) c FROM sessions WHERE status='Completed'"),
    avgRating: q1('SELECT ROUND(AVG(rating),1) a FROM feedback').a
  });
});

app.get('/api/users', auth('admin'), (req, res) => // FR-057, UC-004
  res.json(qa('SELECT id,name,email,role,status,active FROM users ORDER BY role,name')));

app.post('/api/users/:id/toggle', auth('admin'), wrap((req, res) => { // FR-010, BR-017, BR-018, UC-004
  const u = q1('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u || u.id === req.u.id) return bad(res, 'Cannot change this account.', 409);
  run('UPDATE users SET active=? WHERE id=?', u.active ? 0 : 1, u.id);
  audit(req.u.name, `${u.active ? 'Deactivated' : 'Reactivated'} ${u.name}`); // NFR-023
  res.json({ ok: true });
}));

app.post('/api/users/:id/role', auth('admin'), wrap((req, res) => { // FR-008, BR-017, UC-004
  const r = req.body?.role;
  if (!['student', 'alumnus', 'coordinator', 'admin'].includes(r)) return bad(res, 'Invalid role.');
  if (req.params.id === req.u.id) return bad(res, 'You cannot change your own role.', 409);
  run('UPDATE users SET role=? WHERE id=?', r, req.params.id);
  audit(req.u.name, `Changed role of ${req.params.id} to ${r}`); // NFR-023
  res.json({ ok: true });
}));

app.get('/api/audit', auth('admin'), (req, res) => // FR-061, NFR-023, NFR-024
  res.json(qa('SELECT * FROM audit ORDER BY t DESC LIMIT 100')));

app.get('/api/categories', auth(), (req, res) => res.json(qa('SELECT name FROM cats'))); // FR-060
app.post('/api/categories', auth('admin'), wrap((req, res) => { // FR-060, UC-004
  if (!req.body?.name?.trim()) return bad(res, 'Name required.');
  run('INSERT OR IGNORE INTO cats VALUES(?)', req.body.name.trim());
  res.json({ ok: true });
}));
app.delete('/api/categories/:name', auth('admin'), wrap((req, res) => { // FR-060
  run('DELETE FROM cats WHERE name=?', req.params.name);
  res.json({ ok: true });
}));

// =====================================================================
//  PART A — NEW TRACEABILITY API
// =====================================================================

// Scan server.js for inline requirement tags at startup
let _tagMap = null;
function getTagMap() {
  if (_tagMap) return _tagMap;
  _tagMap = {};
  try {
    const src = fs.readFileSync(__filename, 'utf8').split('\n');
    src.forEach((line, idx) => {
      const matches = line.match(/\/\/ (?:FR|NFR|BR|UC)-\d{3}(?:[, \/]+(?:FR|NFR|BR|UC)-\d{3})*/g) || [];
      matches.forEach(m => {
        const tags = m.replace('//', '').split(/[, \/]+/).map(t => t.trim()).filter(t => /^(FR|NFR|BR|UC)-\d{3}$/.test(t));
        tags.forEach(tag => {
          if (!_tagMap[tag]) _tagMap[tag] = [];
          _tagMap[tag].push({ file: 'server.js', line: idx + 1, snippet: line.trim().slice(0, 80) });
        });
      });
    });
  } catch {}
  return _tagMap;
}
getTagMap(); // warm up

app.get('/api/trace/requirements', auth(), (req, res) => { // Traceability API
  const { type, q: search } = req.query;
  let sql = 'SELECT * FROM requirements WHERE 1=1';
  const params = [];
  if (type && ['FR','NFR','BR'].includes(type)) { sql += ' AND type=?'; params.push(type); }
  if (search) { sql += ' AND (title LIKE ? OR description LIKE ? OR id LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  sql += ' ORDER BY id';
  const rows = qa(sql, ...params);
  const tagMap = getTagMap();
  res.json(rows.map(r => ({ ...r, enforcedAt: tagMap[r.id] || [] })));
});

app.get('/api/trace/usecases', auth(), (req, res) => {
  res.json(qa('SELECT * FROM usecases ORDER BY id').map(u => ({
    ...u,
    secondaryActors: JSON.parse(u.secondary_actors || '[]'),
    preconditions: JSON.parse(u.preconditions || '[]'),
    mainFlow: JSON.parse(u.main_flow || '[]'),
    altFlows: JSON.parse(u.alt_flows || '[]'),
    postconditions: JSON.parse(u.postconditions || '[]'),
    relatedFR: JSON.parse(u.related_fr || '[]'),
    relatedBR: JSON.parse(u.related_br || '[]'),
    relatedNFR: JSON.parse(u.related_nfr || '[]'),
  })));
});

app.get('/api/trace/screen/:screenId', auth(), (req, res) => {
  const links = qa('SELECT * FROM trace_links WHERE screen_id=?', req.params.screenId);
  const byType = (t) => [...new Set(links.filter(l => l.ref_type === t).map(l => l.ref_id))];
  const frIds = byType('FR'), nfrIds = byType('NFR'), brIds = byType('BR'), ucIds = byType('UC');
  const tagMap = getTagMap();
  const reqById = id => { const r = q1('SELECT * FROM requirements WHERE id=?', id); return r ? { ...r, enforcedAt: tagMap[id] || [] } : null; };
  res.json({
    screenId: req.params.screenId,
    screen: q1('SELECT * FROM screens WHERE id=?', req.params.screenId),
    frs: frIds.map(reqById).filter(Boolean),
    nfrs: nfrIds.map(reqById).filter(Boolean),
    brs: brIds.map(reqById).filter(Boolean),
    usecases: ucIds.map(id => {
      const u = q1('SELECT id,name,primary_actor FROM usecases WHERE id=?', id);
      return u ? { id: u.id, name: u.name, primaryActor: u.primary_actor } : null;
    }).filter(Boolean),
    links,
  });
});

app.get('/api/trace/matrix', auth(...staff), (req, res) => {
  const allReqs = qa('SELECT id,type,title,priority FROM requirements ORDER BY id');
  const allScreens = qa('SELECT id,title FROM screens ORDER BY id');
  const allUCs = qa('SELECT id,name,primary_actor FROM usecases ORDER BY id');
  const allLinks = qa('SELECT * FROM trace_links');
  const tagMap = getTagMap();

  // Build coverage map
  const covered = {}; // req_id -> [screen_ids]
  allLinks.forEach(l => {
    if (!covered[l.ref_id]) covered[l.ref_id] = [];
    if (!covered[l.ref_id].includes(l.screen_id)) covered[l.ref_id].push(l.screen_id);
  });

  // Read backendOnly set from requirements.json
  let backendOnlySet = new Set();
  try {
    const reqJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'requirements.json'), 'utf8'));
    backendOnlySet = new Set((reqJson.backendOnly || []).map(b => b.id));
  } catch(e) {}

  const matrix = allReqs.map(r => {
    const hasScreen = covered[r.id] && covered[r.id].length > 0;
    const hasCode = !!(tagMap[r.id] && tagMap[r.id].length);
    const isBackend = backendOnlySet.has(r.id);
    const uncovered = !hasScreen && !hasCode && !isBackend;
    return {
      ...r,
      screens: covered[r.id] || [],
      coveredByCode: hasCode,
      backendOnly: isBackend,
      uncovered,
    };
  });

  const ucScreenMap = {};
  allLinks.filter(l => l.ref_type === 'UC').forEach(l => {
    if (!ucScreenMap[l.ref_id]) ucScreenMap[l.ref_id] = [];
    if (!ucScreenMap[l.ref_id].includes(l.screen_id)) ucScreenMap[l.ref_id].push(l.screen_id);
  });

  res.json({
    requirements: matrix,
    screens: allScreens,
    usecases: allUCs.map(u => ({ ...u, screens: ucScreenMap[u.id] || [] })),
    summary: {
      totalFR: allReqs.filter(r => r.type === 'FR').length,
      totalNFR: allReqs.filter(r => r.type === 'NFR').length,
      totalBR: allReqs.filter(r => r.type === 'BR').length,
      totalUC: allUCs.length,
      coveredFR: matrix.filter(r => r.type === 'FR' && !r.uncovered).length,
      coveredNFR: matrix.filter(r => r.type === 'NFR' && !r.uncovered).length,
      coveredBR: matrix.filter(r => r.type === 'BR' && !r.uncovered).length,
      uncoveredReqs: matrix.filter(r => r.uncovered).map(r => r.id),
    }
  });
});

app.post('/api/trace/event', auth(), wrap((req, res) => { // Log shortcut/overlay events
  const { keyCombo, action, screenId } = req.body || {};
  if (!keyCombo || !action) return bad(res, 'keyCombo and action required.');
  const id = nid('ev');
  run('INSERT INTO shortcut_events(id,user_id,role,key_combo,action,screen_id,ts) VALUES(?,?,?,?,?,?,?)',
    id, req.u.id, req.u.role, keyCombo, action, screenId || null, now());
  // Push SSE to dashboard clients
  pushSSE({ type: 'shortcut_event', id, userId: req.u.id, name: req.u.name, role: req.u.role,
    keyCombo, action, screenId: screenId || null, ts: now() });
  res.json({ ok: true, id });
}));

app.get('/api/trace/events', auth(...staff), (req, res) => { // Live feed for admin/coordinator
  const limit = Math.min(+req.query.limit || 50, 200);
  const rows = qa('SELECT e.*,u.name user_name FROM shortcut_events e LEFT JOIN users u ON u.id=e.user_id ORDER BY e.ts DESC LIMIT ?', limit);
  res.json(rows);
});

app.get('/api/trace/stream', auth(), (req, res) => { // SSE stream for dashboard
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: now() })}\n\n`);
  sseClients.add(res);
  const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); sseClients.delete(res); } }, 25000);
  req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
});

// ---- Demo endpoints ----
if (DEMO) {
  app.post('/api/demo/reset', auth('admin'), wrap((req, res) => {
    const { seed } = require('./db');
    seed(true);
    res.json({ ok: true, message: 'Demo data reset.' });
  }));

  // Cycle demo roles: return credentials for next demo account
  const DEMO_ACCOUNTS = [
    { email: 'student@demo.com', role: 'student' },
    { email: 'mentor@demo.com', role: 'alumnus' },
    { email: 'coord@demo.com', role: 'coordinator' },
    { email: 'admin@demo.com', role: 'admin' },
  ];
  app.post('/api/demo/next-role', wrap((req, res) => {
    const current = req.body?.currentRole || 'admin';
    const idx = DEMO_ACCOUNTS.findIndex(a => a.role === current);
    const next = DEMO_ACCOUNTS[(idx + 1) % DEMO_ACCOUNTS.length];
    const u = q1('SELECT * FROM users WHERE email=?', next.email);
    if (!u) return bad(res, 'Demo account not found', 404);
    res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '8h' }), user: pub(u) });
  }));
}

// ---- Static assets ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---- Server startup ----
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`\n🎓 Alumni Mentorship Portal v2.0`);
    console.log(`   URL:  http://localhost:${PORT}`);
    console.log(`   Mode: ${DEMO ? '🟡 DEMO' : 'Normal'}`);
    console.log(`\n   Demo accounts (password: demo123):`);
    console.log(`     Student:     student@demo.com`);
    console.log(`     Mentor:      mentor@demo.com`);
    console.log(`     Coordinator: coord@demo.com`);
    console.log(`     Admin:       admin@demo.com`);
    console.log(`\n   Traceability: Alt+F/N/B/U/A/T/?  (press Alt+? on any screen)\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down gracefully...');
    sseClients.forEach(c => { try { c.end(); } catch {} });
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
