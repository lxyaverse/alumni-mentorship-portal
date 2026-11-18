# Deployment Guide — Alumni Mentorship Portal

This guide provides instructions for deploying the **Alumni Mentorship Portal** (LNMIIT CS314, Team T069) with persistent SQLite storage or fallback serverless deployment.

---

## Architecture & Storage Note

The portal uses **SQLite** (`better-sqlite3` with WAL mode and foreign keys enabled) located at `data/portal.db` (or configurable via `DB_FILE`). For a production live demo with data persistence across service restarts, deploy using a host that supports **persistent volume disks** (Render or Railway).

---

## Option 1: Render (Primary — Persistent SQLite Disk)

Render provides persistent disks ensuring all seeded demo accounts, new mentorship requests, and sessions persist permanently across redeployments.

### Step-by-Step Instructions:

1. **Push to GitHub**:
   Ensure your code is pushed to your Git repository.

2. **Create Web Service on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com) and click **New + > Web Service**.
   - Connect your GitHub repository.
   - Set **Environment** to `Node`.
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`

3. **Attach Persistent Disk**:
   - Under **Disks**, click **Add Disk**.
   - **Name**: `portal-data`
   - **Mount Path**: `/app/data` (or `./data`)
   - **Size**: 1 GB (sufficient for thousands of mentorship records)

4. **Environment Variables**:
   Add the following variables in the Render dashboard:
   ```env
   PORT=3000
   JWT_SECRET=generate-a-secure-random-string-here
   DEMO=1
   DB_FILE=/app/data/portal.db
   NODE_ENV=production
   ```

5. **Deploy**:
   - Click **Create Web Service**.
   - The application will build, auto-create `/app/data/portal.db`, seed demo accounts, and listen on the assigned public URL.

*(Note: You can also use the included [`render.yaml`](./render.yaml) for one-click blueprint deployment via Render Blueprints).*

---

## Option 2: Railway (Alternative Persistent Deployment)

Railway supports persistent volume mounts for Docker or Node containers.

1. Install Railway CLI or go to [railway.app](https://railway.app).
2. Create a new project from your GitHub repo.
3. Add a Volume:
   - Click **+ New > Volume**.
   - Mount path: `/app/data`.
4. Set Environment Variables:
   ```env
   PORT=3000
   JWT_SECRET=super-secret-key-32-chars-long
   DEMO=1
   DB_FILE=/app/data/portal.db
   ```
5. Deploy. The Dockerfile included in the repository will build and launch with native `better-sqlite3` support.

---

## Option 3: Local Docker Deployment

You can build and run the portal container locally using Docker:

```bash
# 1. Build the Docker container
docker build -t alumni-mentorship-portal .

# 2. Run the container with a persistent volume
docker run -d -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -e DEMO=1 \
  -e JWT_SECRET=demo-secret-key \
  --name amp-demo alumni-mentorship-portal

# 3. View logs
docker logs -f amp-demo

# 4. Open in browser
# http://localhost:3000
```

---

## Option 4: Vercel (Stateless Fallback)

The repository retains [`vercel.json`](./vercel.json) configuration for instant serverless hosting.

> **Important**: On Vercel, the filesystem is read-only except for `/tmp`. The database will be stored in `/tmp/portal.db` and is re-seeded on cold starts. It is suitable for stateless evaluation and rapid presentation previews.

1. Import the repository into Vercel.
2. In Project Settings, set:
   ```env
   JWT_SECRET=strong-random-key
   DEMO=1
   ```
3. Deploy. The Node.js 20 serverless runtime executes the REST API.
