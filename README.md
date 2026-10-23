# Alumni Mentorship Portal (CS314 · Team T069)

Full-stack implementation of SRS v1.0: **Node.js + Express REST API**, **SQLite** (better-sqlite3), **JWT** auth with **bcrypt** password hashing, and a vanilla-JS client served from `/public`.

```
├── server.js        REST API + business rules (BR/FR ids in comments), RBAC middleware
├── db.js            SQLite schema + seed data
├── public/          client (index.html, app.js, style.css)
├── package.json  .env.example  .gitignore
```

## Run
```bash
npm install
cp .env.example .env     # optional; set JWT_SECRET for production
DEMO=1 npm start         # DEMO=1 enables the "fast-forward" button so a session can be completed in a demo
# open http://localhost:3000
```
`npm run seed` re-inserts the demo data. The DB file lives in `data/portal.db` (git-ignored).

## Demo accounts (password `demo123`)
student@demo.com · mentor@demo.com · coord@demo.com · admin@demo.com (plus pending@demo.com, an unverified alumnus)

## Architecture (NFR-015)
Presentation (`public/`) → API/application logic (`server.js`) → data access (`db.js`). Every rule is enforced server-side (NFR-006); the client only renders.

## API summary
| Area | Endpoints |
|---|---|
| Auth | `POST /api/register`, `POST /api/login`, `GET /api/me` |
| Mentors | `GET /api/mentors?s&d&a&o`, `GET/PUT /api/profile`, `GET /api/cats` |
| Requests | `POST /api/requests`, `GET /api/requests`, `POST /api/requests/:id/withdraw` · `respond` (accept/decline/refer) · `reassign` |
| Sessions | `POST /api/sessions`, `GET /api/sessions`, `POST /api/sessions/:id/complete` · `cancel` |
| Feedback | `POST /api/feedback` |
| Notifications | `GET /api/notifications`, `GET /api/notifications/count` |
| Staff | `GET /api/verifications`, `POST /api/verifications/:id`, `GET /api/stats`, `GET /api/users`, `POST /api/users/:id/toggle` · `role`, `GET /api/audit`, `POST /api/categories` |

## Requirements covered
Auth, roles, deactivation, alumni verification, mentor profile/visibility, search/filter/sort, requests (BR-004/005/006/008/009), expiry job, referral & reassignment, sessions (BR-010/011/012), feedback (BR-013/014/015, FR-048, comment visibility FR-050), notifications, dashboard, audit log.

## Not yet implemented
Email delivery and password-reset links, session reminders, automated tests, rate limiting. Add `helmet` and HTTPS before real deployment.

## Push to GitHub
```bash
git init && git add . && git commit -m "Alumni Mentorship Portal: server + client"
git branch -M main
git remote add origin https://github.com/<you>/alumni-mentorship-portal.git
git push -u origin main
```
