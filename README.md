# Alumni Mentorship Portal

**CS314 Software Development Laboratory · Team T069**  
**The LNM Institute of Information Technology, Jaipur**

The Alumni Mentorship Portal is a web-based platform that connects current students with verified alumni for structured, trackable mentorship. Students can discover mentors by domain and expertise, send requests, schedule sessions, and submit feedback. Alumni can create profiles, manage availability, respond to requests, and conduct sessions through an external meeting link.

This repository contains the working prototype for the project described in the team's SRS v1.0.

## Team

| Name | Roll number | Primary SRS contribution |
|---|---|---|
| **Lakshya Mittal** | 24UCS140 | User classes, system context, functional requirements FR-001–FR-023, business rules |
| **Aakansha Garg** | 24UCS141 | Non-functional requirements, data requirements, mentorship lifecycle, major use cases |
| **Sumit Sharma** | 24UCS142 | Requirements traceability, validation, quality criteria, change management, future requirements, versioning |
| **Tanishka Khandelwal** | 24UCS143 | Detailed use cases, user stories, acceptance criteria, requirements prioritization |

**Development model:** Agile and incremental development  
**Course:** Software Engineering (CS314)  
**Team ID:** T069

## Project vision

Students often need advice about career paths, higher studies, interview preparation, and industry exposure, but informal introductions and one-off messages do not scale. This portal provides one organized place where:

- Students can find alumni who are open to mentoring.
- Alumni can describe their experience, expertise, and availability.
- Requests, matching, sessions, and feedback can be tracked.
- Coordinators can verify alumni and reassign referred requests.
- Administrators can monitor activity, users, and audit records.

## Main capabilities

### Students

- Register and log in securely.
- Search mentors by keyword, domain, organization, and expertise.
- Filter mentors by availability and sort by rating, experience, or availability.
- View mentor profiles without exposing personal contact details.
- Send, track, and withdraw mentorship requests.
- View scheduled sessions and meeting links.
- Rate completed sessions and leave optional feedback.
- Receive notifications about request and session activity.

### Alumni mentors

- Register for coordinator verification.
- Create and edit a mentor profile after verification.
- Add designation, organization, industry, domain, expertise, experience, introduction, capacity, and availability.
- Accept, decline, or refer student requests.
- Schedule sessions with date, time, duration, and an external meeting link.
- Mark sessions complete and view student feedback.

### Coordinators and administrators

- Review and verify or reject alumni accounts.
- Record a rejection reason.
- Reassign referred or expired requests to available mentors.
- View dashboard statistics and audit activity.
- Manage users and account activation status.
- Manage mentor categories.

## Technology stack

- **Runtime:** Node.js 18+
- **Backend:** Express 4
- **Database:** SQLite using `better-sqlite3`
- **Authentication:** JWT
- **Password security:** `bcryptjs`
- **Frontend:** HTML, CSS, and vanilla JavaScript
- **API style:** REST endpoints under `/api`

## Architecture

```text
Browser client (public/)
        |
        v
Express REST API (server.js)
        |
        v
SQLite data access and schema (db.js)
```

Business rules and role-based access control are enforced on the server. The client is responsible for presentation and calling the API; it does not replace server-side authorization.

## Project structure

```text
.
├── server.js          Express server, REST API, RBAC, and business rules
├── db.js              SQLite schema, queries, and seed data
├── public/
│   ├── index.html     Application shell
│   ├── app.js         Client-side views and API interactions
│   └── style.css      Responsive visual design
├── package.json       Scripts and dependencies
├── package-lock.json  Locked dependency versions
├── .env.example       Environment variable template
└── README.md          Project documentation
```

Runtime database files are created under `data/`, which is intentionally excluded from Git.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

For local development, the defaults work without an `.env` file. To configure a JWT secret:

```bash
copy .env.example .env
```

On macOS/Linux, use `cp .env.example .env` instead.

### 3. Start the application

```bash
npm start
```

For the presentation/demo flow, enable the demo-only fast-forward action:

```bash
# Windows PowerShell
$env:DEMO="1"; npm start

# macOS/Linux
DEMO=1 npm start
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Reset demo data

```bash
npm run seed
```

This recreates the seeded portal data in `data/portal.db`.

## Deploy to Vercel

Import this repository into Vercel with the project root set to the repository root. The included [`vercel.json`](./vercel.json) routes the browser client from `public/` and exposes the Express API through a serverless function.

Add the following environment variables in the Vercel project settings:

```text
JWT_SECRET=<a-long-random-secret>
DEMO=0
```

The SQLite database uses `/tmp` on Vercel because the deployed project filesystem is read-only. That storage is temporary and instance-local, so this deployment is suitable for a demo only. Use a hosted database for persistent production data.

## Demo accounts

All seeded demo accounts use the password `demo123`.

| Role | Email | What to demonstrate |
|---|---|---|
| Student | `student@demo.com` | Discover mentors, send requests, view sessions, submit feedback |
| Mentor | `mentor@demo.com` | Manage profile, respond to requests, schedule sessions |
| Coordinator | `coord@demo.com` | Verify alumni and reassign referred requests |
| Administrator | `admin@demo.com` | View dashboard, manage users, inspect audit activity |
| Pending alumnus | `pending@demo.com` | Demonstrate the verification-pending state |

## Typical demo flow

1. Log in as the seeded student.
2. Open **Find your mentor** and search or filter the mentor list.
3. Send a request with a topic, goal, and preferred time.
4. Log in as the mentor and accept the request.
5. Schedule a session using an external meeting link.
6. Use `DEMO=1` to fast-forward the session during a presentation.
7. Log back in as the student and submit a rating and feedback.
8. Use the coordinator and administrator accounts to demonstrate verification, dashboard, and audit features.

## API overview

| Area | Representative endpoints |
|---|---|
| Authentication | `POST /api/register`, `POST /api/login`, `GET /api/me` |
| Mentors and profiles | `GET /api/mentors`, `GET/PUT /api/profile`, `GET /api/cats` |
| Requests | `POST /api/requests`, `GET /api/requests`, request withdraw/respond/reassign routes |
| Sessions | `POST /api/sessions`, `GET /api/sessions`, complete/cancel routes |
| Feedback | `POST /api/feedback` |
| Notifications | `GET /api/notifications`, `GET /api/notifications/count` |
| Staff operations | Verification, statistics, users, categories, and audit routes |

## Scope and limitations

### Included in this prototype

Authentication, role-based access, account deactivation, alumni verification, mentor profiles, discovery, requests, matching/reassignment, session scheduling and tracking, feedback, notifications, dashboard statistics, and audit logging.

### Not currently included

- Email delivery and password-reset links
- Automated test suite
- Rate limiting, Helmet, and production HTTPS configuration
- In-app video/audio calling
- Real-time chat
- Payment or paid mentorship
- Mobile application
- Institute alumni database integration
- Calendar integration, advanced analytics, resume review, and job-referral tracking

Sessions currently use an external meeting URL entered by the mentor.

## Security notes

This is an academic prototype intended for local demonstration. Before production deployment:

- Set a strong, private `JWT_SECRET`.
- Run behind HTTPS.
- Add security headers such as Helmet.
- Add rate limiting and account recovery flows.
- Use a managed database and secure secret storage.
- Review privacy, logging, and data-retention requirements.

## License

This project is released under the MIT license.
