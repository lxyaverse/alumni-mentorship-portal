const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs'), path = require('path'), db = require('./db');
const app = express(), SECRET = process.env.JWT_SECRET || 'dev-secret-change-me', PORT = process.env.PORT || 3000, DEMO = process.env.DEMO === '1';
app.use(express.json({ limit: '50kb' }));
const now = () => Date.now(), DAY = 864e5, nid = p => p + Math.random().toString(36).slice(2, 10);
const bad = (s, m, c = 400) => s.status(c).json({ error: m });
const q1 = (sql, ...a) => db.prepare(sql).get(...a), qa = (sql, ...a) => db.prepare(sql).all(...a), run = (sql, ...a) => db.prepare(sql).run(...a);
const note = (u, m) => run('INSERT INTO notes VALUES(?,?,?,0,?)', nid('n'), u, m, now());
const audit = (actor, a) => run('INSERT INTO audit VALUES(?,?,?)', now(), actor, a);
const rating = m => { const r = q1('SELECT AVG(rating) a,COUNT(*) c FROM feedback WHERE mid=?', m); return r.c >= 3 ? +r.a.toFixed(1) : null; }; // BR-015
const taken = m => q1("SELECT COUNT(*) c FROM requests WHERE mid=? AND status='Accepted'", m).c;
const expire = () => qa("SELECT * FROM requests WHERE status='Pending' AND created<?", now() - 7 * DAY).forEach(r => { // FR-037 / BR-008
  run("UPDATE requests SET status='Expired' WHERE id=?", r.id); note(r.sid, `Your request "${r.topic}" expired (no response in 7 days).`); });
setInterval(expire, 60000);
const auth = (...roles) => (req, res, next) => {
  let u; try { u = q1('SELECT * FROM users WHERE id=?', jwt.verify((req.headers.authorization || '').slice(7), SECRET).id); } catch { return bad(res, 'Not authenticated', 401); }
  if (!u || !u.active) return bad(res, 'Account inactive', 401);
  if (roles.length && !roles.includes(u.role)) return bad(res, 'Forbidden', 403); // FR-009 / NFR-006 server-side RBAC
  req.u = u; expire(); next();
};
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, why: u.why });
const wrap = f => (req, res) => { try { f(req, res); } catch (e) { console.error(e); bad(res, 'Server error', 500); } };

// ---- Auth ----
app.post('/api/register', wrap((req, res) => {
  const { name, email, password, role, grad, degree, org } = req.body || {};
  if (!name || !email || !password) return bad(res, 'Name, email and password are required.');
  if (password.length < 6) return bad(res, 'Password must be at least 6 characters.');
  if (!['student', 'alumnus'].includes(role)) return bad(res, 'Role must be student or alumnus.');
  if (q1('SELECT 1 FROM users WHERE email=?', email.toLowerCase())) return bad(res, 'Email already registered.', 409);
  run('INSERT INTO users(id,name,email,pw,role,status,grad,degree,org) VALUES(?,?,?,?,?,?,?,?,?)', nid('u'), name.trim(), email.toLowerCase().trim(), bcrypt.hashSync(password, 10), role,
    role === 'alumnus' ? 'pending' : null, grad || null, degree || null, org || null); // FR-002
  res.json({ ok: true });
}));
app.post('/api/login', wrap((req, res) => {
  const u = q1('SELECT * FROM users WHERE email=?', String(req.body?.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body?.password || ''), u.pw)) return bad(res, 'Invalid email or password.', 401); // FR-005
  if (!u.active) return bad(res, 'Account deactivated.', 403);
  res.json({ token: jwt.sign({ id: u.id }, SECRET, { expiresIn: '2h' }), user: pub(u) }); // NFR-008
}));
app.get('/api/me', auth(), (req, res) => res.json(pub(req.u)));
app.get('/api/cats', auth(), (req, res) => res.json(qa('SELECT name FROM cats ORDER BY name').map(c => c.name)));

// ---- Mentor profile & discovery ----
app.get('/api/profile', auth('alumnus'), (req, res) => res.json(q1('SELECT * FROM profiles WHERE uid=?', req.u.id) || {}));
app.put('/api/profile', auth('alumnus'), wrap((req, res) => {
  if (req.u.status !== 'verified') return bad(res, 'Only verified alumni can create a mentor profile.', 403); // BR-001
  const b = req.body || {}, avail = ['Available', 'Limited', 'Unavailable'].includes(b.avail) ? b.avail : 'Available';
  run('INSERT OR REPLACE INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', req.u.id, b.designation, b.org, b.industry, b.domain, b.expertise, +b.years || 0, +b.grad || null, b.intro, avail,
    Math.max(1, +b.cap || 1), b.designation && b.org && b.domain ? 1 : 0);
  res.json({ ok: true });
}));
app.get('/api/mentors', auth('student', 'alumnus', 'coordinator', 'admin'), (req, res) => {
  const { s = '', d = '', a = '', o = 'rating' } = req.query;
  let l = qa("SELECT p.*,u.name FROM profiles p JOIN users u ON u.id=p.uid WHERE u.status='verified' AND u.active=1 AND p.complete=1") // FR-016
    .filter(p => (!s || [p.domain, p.industry, p.org, p.expertise].join(' ').toLowerCase().includes(s.toLowerCase())) && (!d || p.domain === d) && (!a || p.avail === a))
    .map(p => ({ ...p, rating: rating(p.uid), taken: taken(p.uid) }));
  l.sort((x, y) => o === 'years' ? y.years - x.years : o === 'avail' ? x.avail.localeCompare(y.avail) : (y.rating || 0) - (x.rating || 0)); // FR-021
  res.json(l);
});

// ---- Requests (UC-009 / UC-012) ----
app.post('/api/requests', auth('student'), wrap((req, res) => {
  const { mid, topic, msg, slot } = req.body || {};
  if (!mid || !topic?.trim() || !msg?.trim() || !slot?.trim()) return bad(res, 'Topic, message and a preferred time slot are required.'); // FR-025
  const p = q1("SELECT p.* FROM profiles p JOIN users u ON u.id=p.uid WHERE p.uid=? AND u.status='verified' AND u.active=1 AND p.complete=1", mid);
  if (!p) return bad(res, 'Mentor not found or not visible.', 404);
  if (p.avail === 'Unavailable') return bad(res, 'This mentor is currently unavailable. Try another mentor.');
  if (q1("SELECT 1 FROM requests WHERE sid=? AND mid=? AND status IN('Pending','Accepted')", req.u.id, mid)) return bad(res, 'You already have a pending or accepted request with this mentor (BR-004).', 409);
  if (q1("SELECT COUNT(*) c FROM requests WHERE sid=? AND status='Pending'", req.u.id).c >= 3) return bad(res, 'You can have at most 3 pending requests (BR-005).', 409);
  run('INSERT INTO requests(id,sid,mid,topic,domain,msg,slot,created) VALUES(?,?,?,?,?,?,?,?)', nid('r'), req.u.id, mid, topic.trim(), p.domain, msg.trim(), slot.trim(), now());
  note(mid, `New mentorship request from ${req.u.name}: ${topic.trim()}`); res.json({ ok: true });
}));
app.get('/api/requests', auth('student', 'alumnus'), (req, res) => {
  const col = req.u.role === 'student' ? 'sid' : 'mid', other = req.u.role === 'student' ? 'mid' : 'sid';
  res.json(qa(`SELECT r.*,u.name other,(SELECT COUNT(*) FROM sessions s WHERE s.rid=r.id AND s.status!='Cancelled') sessions FROM requests r JOIN users u ON u.id=r.${other} WHERE r.${col}=? ORDER BY created DESC`, req.u.id));
});
app.post('/api/requests/:id/withdraw', auth('student'), wrap((req, res) => {
  const r = q1('SELECT * FROM requests WHERE id=? AND sid=?', req.params.id, req.u.id);
  if (!r || r.status !== 'Pending') return bad(res, 'Only your pending requests can be withdrawn.', 409);
  run("UPDATE requests SET status='Withdrawn' WHERE id=?", r.id); res.json({ ok: true });
}));
app.post('/api/requests/:id/respond', auth('alumnus'), wrap((req, res) => {
  const r = q1('SELECT * FROM requests WHERE id=? AND mid=?', req.params.id, req.u.id); // AC-09 only addressed mentor
  if (!r) return bad(res, 'Request not found.', 404);
  if (r.status !== 'Pending') return bad(res, 'Request is no longer active.', 409); // AC-10
  const { action, reason } = req.body || {};
  if (action === 'accept') { if (taken(req.u.id) >= (q1('SELECT cap FROM profiles WHERE uid=?', req.u.id)?.cap || 0)) return bad(res, 'Mentoring capacity reached (BR-006).', 409); run("UPDATE requests SET status='Accepted',responded=? WHERE id=?", now(), r.id); }
  else if (action === 'decline') { if (!reason?.trim()) return bad(res, 'A reason is required to decline (BR-009).'); run("UPDATE requests SET status='Declined',reason=?,responded=? WHERE id=?", reason.trim(), now(), r.id); }
  else if (action === 'refer') run("UPDATE requests SET status='Referred',responded=? WHERE id=?", now(), r.id);
  else return bad(res, 'Unknown action.');
  const st = q1('SELECT status,reason FROM requests WHERE id=?', r.id);
  note(r.sid, `Your request "${r.topic}" was ${st.status.toLowerCase()}${st.reason ? ': ' + st.reason : ''}.`); res.json({ ok: true, status: st.status });
}));

// ---- Sessions ----
const startOf = s => new Date(`${s.date}T${s.time}`).getTime(), endOf = s => startOf(s) + s.dur * 6e4;
app.post('/api/sessions', auth('alumnus'), wrap((req, res) => {
  const { rid, date, time, dur, link } = req.body || {}, r = q1('SELECT * FROM requests WHERE id=? AND mid=?', rid, req.u.id);
  if (!r || r.status !== 'Accepted') return bad(res, 'Sessions can only be scheduled against an accepted request (BR-010).', 409);
  if (!date || !time || !dur || !/^https?:\/\//.test(link || '')) return bad(res, 'Date, time, duration and a valid http(s) meeting link are required.');
  if (startOf({ date, time }) <= now()) return bad(res, 'Session must be scheduled in the future (BR-011).');
  run('INSERT INTO sessions(id,rid,date,time,dur,link) VALUES(?,?,?,?,?,?)', nid('se'), rid, date, time, +dur, link);
  note(r.sid, 'A mentorship session has been scheduled — check Sessions.'); res.json({ ok: true });
}));
app.get('/api/sessions', auth('student', 'alumnus'), (req, res) => {
  const stu = req.u.role === 'student', rows = qa(`SELECT s.*,r.topic,r.sid,r.mid,u.name other FROM sessions s JOIN requests r ON r.id=s.rid JOIN users u ON u.id=r.${stu ? 'mid' : 'sid'} WHERE r.${stu ? 'sid' : 'mid'}=? ORDER BY date DESC,time DESC`, req.u.id);
  res.json(rows.map(s => { const f = q1('SELECT rating,comment FROM feedback WHERE sid=? ' + (stu ? 'AND stu=?' : ''), ...(stu ? [s.id, req.u.id] : [s.id]));
    return { ...s, feedback: f ? { rating: f.rating, comment: stu ? undefined : f.comment } : null }; })); // FR-050
});
const mySession = (req, col) => q1(`SELECT s.*,r.sid,r.mid FROM sessions s JOIN requests r ON r.id=s.rid WHERE s.id=? AND (r.${col}=? )`, req.params.id, req.u.id);
app.post('/api/sessions/:id/complete', auth('alumnus'), wrap((req, res) => {
  const s = mySession(req, 'mid'); if (!s || s.status !== 'Scheduled') return bad(res, 'Session not found or not scheduled.', 404);
  if (now() < endOf(s)) return bad(res, 'A session can be completed only after its scheduled end time (BR-012).', 409);
  run("UPDATE sessions SET status='Completed' WHERE id=?", s.id); note(s.sid, 'Session completed — please leave feedback.'); res.json({ ok: true });
}));
app.post('/api/sessions/:id/cancel', auth('student', 'alumnus'), wrap((req, res) => {
  const s = mySession(req, req.u.role === 'student' ? 'sid' : 'mid'); if (!s || s.status !== 'Scheduled') return bad(res, 'Session not found or not scheduled.', 404);
  if (!req.body?.reason?.trim()) return bad(res, 'A cancellation reason is required (FR-042).');
  run("UPDATE sessions SET status='Cancelled',reason=? WHERE id=?", req.body.reason.trim(), s.id); note(req.u.role === 'student' ? s.mid : s.sid, 'A session was cancelled.'); res.json({ ok: true });
}));
if (DEMO) app.post('/api/sessions/:id/fastforward', auth('alumnus'), wrap((req, res) => { // demo helper: move a session into the past
  const d = new Date(now() - 2 * 36e5); run('UPDATE sessions SET date=?,time=?,dur=30 WHERE id=?', d.toISOString().slice(0, 10), d.toTimeString().slice(0, 5), req.params.id); res.json({ ok: true }); }));

// ---- Feedback (UC-018) ----
app.post('/api/feedback', auth('student'), wrap((req, res) => {
  const { sid, rating: v, comment } = req.body || {}, s = q1('SELECT s.*,r.sid stu,r.mid FROM sessions s JOIN requests r ON r.id=s.rid WHERE s.id=?', sid);
  if (!s || s.stu !== req.u.id) return bad(res, 'Session not found.', 404); // AC-17
  if (s.status !== 'Completed') return bad(res, 'Feedback is only allowed for completed sessions (BR-013).', 409);
  if (!Number.isInteger(v) || v < 1 || v > 5) return bad(res, 'Rating must be an integer from 1 to 5 (BR-014).');
  if (q1('SELECT 1 FROM feedback WHERE sid=? AND stu=?', sid, req.u.id)) return bad(res, 'Feedback already submitted for this session.', 409); // FR-048
  run('INSERT INTO feedback VALUES(?,?,?,?,?,?,?)', nid('f'), sid, req.u.id, s.mid, v, (comment || '').slice(0, 1000), now());
  note(s.mid, 'You received new session feedback.'); res.json({ ok: true });
}));

// ---- Notifications ----
app.get('/api/notifications', auth(), (req, res) => { const l = qa('SELECT * FROM notes WHERE uid=? ORDER BY t DESC LIMIT 100', req.u.id); run('UPDATE notes SET read=1 WHERE uid=?', req.u.id); res.json(l); });
app.get('/api/notifications/count', auth(), (req, res) => res.json({ unread: q1('SELECT COUNT(*) c FROM notes WHERE uid=? AND read=0', req.u.id).c }));

// ---- Coordinator / Admin ----
const staff = ['coordinator', 'admin'];
app.get('/api/verifications', auth(...staff), (req, res) => res.json(qa("SELECT id,name,email,grad,degree,org FROM users WHERE role='alumnus' AND status='pending'")));
app.post('/api/verifications/:id', auth(...staff), wrap((req, res) => {
  const u = q1("SELECT * FROM users WHERE id=? AND role='alumnus'", req.params.id); if (!u) return bad(res, 'Not found', 404);
  const ok = !!req.body?.ok; if (!ok && !req.body?.reason?.trim()) return bad(res, 'A reason is required when rejecting.');
  run('UPDATE users SET status=?,why=? WHERE id=?', ok ? 'verified' : 'rejected', ok ? null : req.body.reason.trim(), u.id); audit(req.u.name, `${ok ? 'Verified' : 'Rejected'} alumnus ${u.name}`); res.json({ ok: true });
}));
app.get('/api/requests/referred', auth(...staff), (req, res) => res.json(qa("SELECT r.*,u.name student FROM requests r JOIN users u ON u.id=r.sid WHERE r.status IN('Referred','Expired') ORDER BY created DESC")));
app.post('/api/requests/:id/reassign', auth('coordinator'), wrap((req, res) => {
  const r = q1("SELECT * FROM requests WHERE id=? AND status IN('Referred','Expired')", req.params.id), m = q1("SELECT * FROM profiles p JOIN users u ON u.id=p.uid WHERE p.uid=? AND u.status='verified' AND p.avail!='Unavailable'", req.body?.mid);
  if (!r || !m) return bad(res, 'Invalid request or mentor.', 404);
  run("UPDATE requests SET mid=?,status='Pending',created=?,reason=NULL WHERE id=?", m.uid, now(), r.id); note(m.uid, 'A request has been reassigned to you.'); note(r.sid, 'Your request was reassigned to a new mentor.'); audit(req.u.name, `Reassigned request "${r.topic}"`); res.json({ ok: true });
}));
app.get('/api/stats', auth(...staff), (req, res) => { const c = (sql) => q1(sql).c; res.json({ students: c("SELECT COUNT(*) c FROM users WHERE role='student'"), mentors: c("SELECT COUNT(*) c FROM users WHERE status='verified'"),
  pending: c("SELECT COUNT(*) c FROM requests WHERE status='Pending'"), accepted: c("SELECT COUNT(*) c FROM requests WHERE status='Accepted'"), scheduled: c("SELECT COUNT(*) c FROM sessions WHERE status='Scheduled'"),
  completed: c("SELECT COUNT(*) c FROM sessions WHERE status='Completed'"), avgRating: q1('SELECT ROUND(AVG(rating),1) a FROM feedback').a }); });
app.get('/api/users', auth('admin'), (req, res) => res.json(qa('SELECT id,name,email,role,status,active FROM users ORDER BY role,name')));
app.post('/api/users/:id/toggle', auth('admin'), wrap((req, res) => { // BR-017/018
  const u = q1('SELECT * FROM users WHERE id=?', req.params.id); if (!u || u.id === req.u.id) return bad(res, 'Cannot change this account.', 409);
  run('UPDATE users SET active=? WHERE id=?', u.active ? 0 : 1, u.id); audit(req.u.name, `${u.active ? 'Deactivated' : 'Reactivated'} ${u.name}`); res.json({ ok: true }); }));
app.post('/api/users/:id/role', auth('admin'), wrap((req, res) => {
  const r = req.body?.role; if (!['student', 'alumnus', 'coordinator', 'admin'].includes(r)) return bad(res, 'Invalid role.');
  run('UPDATE users SET role=? WHERE id=?', r, req.params.id); audit(req.u.name, `Changed role of ${req.params.id} to ${r}`); res.json({ ok: true }); }));
app.get('/api/audit', auth('admin'), (req, res) => res.json(qa('SELECT * FROM audit ORDER BY t DESC LIMIT 50')));
app.get('/api/categories', auth(), (req, res) => res.json(qa('SELECT name FROM cats')));
app.post('/api/categories', auth('admin'), wrap((req, res) => { if (!req.body?.name?.trim()) return bad(res, 'Name required.'); run('INSERT OR IGNORE INTO cats VALUES(?)', req.body.name.trim()); res.json({ ok: true }); }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => bad(res, 'Not found', 404));
if (require.main === module) app.listen(PORT, () => console.log(`Alumni Mentorship Portal on http://localhost:${PORT}${DEMO ? ' (DEMO mode)' : ''}`));
module.exports = app;
