/*
 * =============================================================
 * HIDDEN EXTRA-MODULE DRAFT - NOT CONNECTED TO THE APPLICATION
 * =============================================================
 *
 * This file contains three separate, paste-ready module sections.
 * The application does not import or load this file.
 *
 * When implementing a module, copy only that module's frontend
 * and backend sections into the locations named in its comments.
 *
 * No buttons or other UI controls are created here. Add the controls
 * yourself and wire their click handlers to the functions below.
 */

const EXTRA_MODULES = {

  /* ==========================================================
   * MODULE 1: FORGOT PASSWORD / RESET PASSWORD
   * ========================================================== */
  forgotPassword: {

    /* DATABASE
     * Destination: db.js
     * Location: inside db.exec(`...`) near email_outbox.
     */
    databaseCode: `
CREATE TABLE IF NOT EXISTS password_reset_tokens(
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires INTEGER NOT NULL,
  used INTEGER DEFAULT 0
);
`,

    /* BACKEND
     * Destination: server.js
     * Location 1: add const crypto = require('crypto') near the top.
     * Location 2: paste routes after the auth middleware and before
     * app.get('/api/health').
     */
    backendCode: `
app.post('/api/forgot-password', wrap((req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').run(user.id);
    db.prepare(
      'INSERT INTO password_reset_tokens(token_hash,user_id,expires) VALUES(?,?,?)'
    ).run(tokenHash, user.id, now() + 30 * 60 * 1000);

    db.prepare(
      'INSERT INTO email_outbox(id,to_email,subject,body,sent,created) VALUES(?,?,?,?,0,?)'
    ).run(
      nid('e'),
      user.email,
      'Password reset',
      'Password reset demo token: ' + token,
      now()
    );

    if (process.env.DEMO === '1') {
      return res.json({
        ok: true,
        message: 'If the account exists, a reset link was sent.',
        demoToken: token
      });
    }
  }

  res.json({
    ok: true,
    message: 'If the account exists, a reset link was sent.'
  });
}));

app.post('/api/reset-password', wrap((req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || password.length < 6) {
    return bad(
      res,
      'A valid token and password of at least 6 characters are required.'
    );
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare(
    'SELECT * FROM password_reset_tokens WHERE token_hash=? AND used=0'
  ).get(tokenHash);

  if (!row || row.expires < now()) {
    return bad(res, 'Reset link is invalid or expired.');
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET pw=? WHERE id=?')
      .run(bcrypt.hashSync(password, 10), row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used=1 WHERE token_hash=?')
      .run(tokenHash);
  })();

  res.json({ ok: true, message: 'Password updated successfully.' });
}));
`,

    /* FRONTEND
     * Destination: public/app.js
     * Location: add your Forgot password button beside the login button
     * inside vAuth(), then call forgotPassword() from its click handler.
     * TODO (UI): create and style that button in the existing auth view.
     *
     * Destination: public/index.html
     * Location: no separate script is required if these functions are
     * pasted into the existing frontend application files.
     */
    frontendCode: `
async function forgotPassword() {
  const email = prompt('Enter your account email');
  if (!email) return;

  const response = await fetch('/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await response.json();

  if (!response.ok) {
    alert(data.error || 'Unable to request a password reset.');
    return;
  }

  if (data.demoToken) {
    const password = prompt('Enter your new password');
    if (!password) return;

    const resetResponse = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.demoToken, password })
    });
    const resetData = await resetResponse.json();
    alert(resetData.message || resetData.error);
  } else {
    alert(data.message);
  }
}

// TODO (UI): Add your Forgot password button in vAuth() and call
// forgotPassword() when the user clicks it. No button is implemented here.
`
  },

  /* ==========================================================
   * MODULE 2: ACCOUNT SETTINGS
   * ========================================================== */
  accountSettings: {

    /* BACKEND
     * Destination: server.js
     * Location: after the auth middleware and before app.get('/api/health').
     */
    backendCode: `
app.get('/api/account', auth(), (req, res) => {
  res.json({
    id: req.u.id,
    name: req.u.name,
    email: req.u.email,
    role: req.u.role
  });
});

app.patch('/api/account', auth(), wrap((req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return bad(res, 'Name is required.');

  db.prepare('UPDATE users SET name=? WHERE id=?')
    .run(name, req.u.id);
  res.json({ ok: true, name });
}));

app.post('/api/account/password', auth(), wrap((req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!bcrypt.compareSync(currentPassword, req.u.pw)) {
    return bad(res, 'Current password is incorrect.', 401);
  }
  if (newPassword.length < 6) {
    return bad(res, 'New password must be at least 6 characters.');
  }

  db.prepare('UPDATE users SET pw=? WHERE id=?')
    .run(bcrypt.hashSync(newPassword, 10), req.u.id);
  res.json({ ok: true, message: 'Password changed successfully.' });
}));
`,

    /* FRONTEND
     * Destination: public/app-core.js
     * Location: after register().
     *
     * Destination: public/app.js
     * Location: beside the Log out button in the signed-in header.
     * TODO (UI): create the Account settings button and call
     * openAccountSettings() from its click handler.
     */
    frontendCode: `
async function openAccountSettings() {
  const token = localStorage.getItem('amp-token');
  const response = await fetch('/api/account', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const account = await response.json();
  if (!response.ok) {
    alert(account.error || 'Unable to load account.');
    return;
  }

  const name = prompt('Name', account.name);
  if (!name) return;

  await fetch('/api/account', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ name })
  });

  const changePassword = confirm('Change password too?');
  if (changePassword) {
    const currentPassword = prompt('Enter your current password');
    const newPassword = prompt('Enter a new password');
    if (!currentPassword || !newPassword) return;

    await fetch('/api/account/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  alert('Account updated.');
  render();
}

// TODO (UI): Add your Account settings button in the signed-in header and
// call openAccountSettings() when it is clicked. No button is implemented here.
`
  },

  /* ==========================================================
   * MODULE 3: SESSION FEEDBACK
   * ========================================================== */
  sessionFeedback: {

    /* BACKEND
     * Destination: server.js
     * Location: after auth middleware, preferably beside existing
     * app.post('/api/feedback') route.
     */
    backendCode: `
app.post('/api/session-feedback', auth('student'), wrap((req, res) => {
  const { sessionId, rating, comment } = req.body || {};
  const ratingNumber = Number(rating);

  if (!sessionId || !Number.isInteger(ratingNumber) ||
      ratingNumber < 1 || ratingNumber > 5) {
    return bad(res, 'Session and a 1-5 rating are required.');
  }

  const session = db.prepare('SELECT * FROM sessions WHERE id=?')
    .get(sessionId);
  if (!session) return bad(res, 'Session not found.', 404);

  const request = db.prepare('SELECT * FROM requests WHERE id=?')
    .get(session.rid);
  if (!request || request.sid !== req.u.id) {
    return bad(res, 'Forbidden', 403);
  }
  if (session.status !== 'Completed') {
    return bad(res, 'Feedback is allowed only after completion.', 409);
  }
  if (db.prepare(
    'SELECT 1 FROM feedback WHERE sid=? AND stu=?'
  ).get(sessionId, req.u.id)) {
    return bad(res, 'Feedback already submitted.', 409);
  }

  db.prepare(
    'INSERT INTO feedback(id,sid,stu,mid,rating,comment,t) VALUES(?,?,?,?,?,?,?)'
  ).run(
    nid('f'),
    sessionId,
    req.u.id,
    request.mid,
    ratingNumber,
    String(comment || '').slice(0, 1000),
    now()
  );

  res.json({ ok: true, message: 'Feedback submitted.' });
}));
`,

    /* FRONTEND
     * Destination: public/app-views.js
     * Location: in the completed-session section or beside existing
     * feedback controls.
     * TODO (UI): create the feedback button/control and call
     * openSessionFeedback(sessionId) from its click handler.
     *
     * Destination: public/app-core.js
     * Location: export the function if needed with window.openSessionFeedback.
     */
    frontendCode: `
async function openSessionFeedback(sessionId) {
  if (!sessionId) return;

  const rating = Number(prompt('Rating from 1 to 5'));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;

  const comment = prompt('Optional feedback comment') || '';
  const response = await fetch('/api/session-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + localStorage.getItem('amp-token')
    },
    body: JSON.stringify({ sessionId, rating, comment })
  });
  const data = await response.json();

  alert(data.message || data.error);
  if (response.ok) render();
}

// TODO (UI): Add your feedback button in the completed-session view and call
// openSessionFeedback(sessionId) when it is clicked. No button is implemented here.
`
  }
};

// Intentionally no side effects.
// This file remains separate and is not loaded or required by the app.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EXTRA_MODULES;
}
