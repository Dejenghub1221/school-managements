# Deploying School Management to Aletcloud

Complete step-by-step guide. No code changes needed — everything is already configured.

---

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier is enough)
- A [GitHub](https://github.com) account (Aletcloud deploys from Git)
- Your code pushed to a GitHub repository

---

## Step 1 — Create the PostgreSQL Database (Supabase)

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a name, set a strong database password, pick the nearest region
3. Wait ~2 minutes for the project to provision
4. Go to **SQL Editor** (left sidebar)
5. Click **New query**, paste the entire contents of `server/src/db/schema.sql`, click **Run**
6. Go to **Project Settings → Database → Connection string → URI**
7. Copy the URI — it looks like:
   ```
   postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
   ```
   Keep this — you will need it in Step 3.

---

## Step 2 — Push Your Code to GitHub

```bash
# From the project root (school-management/)
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/school-management.git
git push -u origin main
```

> Make sure `.gitignore` already includes `.env` and `node_modules/` — it does.

---

## Step 3 — Deploy the Backend (Node.js service)

1. Log in to [Aletcloud](https://aletcloud.app) → **New Service → Web Service**
2. Connect your GitHub repo
3. Set the **Root directory** to `server`
4. Set the **Build command** to:
   ```
   npm install
   ```
5. Set the **Start command** to:
   ```
   npm start
   ```
6. Set **Runtime** to **Node 18** (or higher)
7. Under **Environment Variables**, add these one by one:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `DATABASE_URL` | *(the URI you copied from Supabase)* |
   | `JWT_SECRET` | *(any long random string — e.g. 32+ random characters)* |
   | `DEMO_PASSWORD` | `school123` *(or change it)* |

8. Click **Deploy**
9. Wait for deployment to finish — you will get a URL like:
   ```
   https://school-api.aletcloud.app
   ```
   Copy this URL — you need it for the frontend.

---

## Step 4 — Seed the Demo Data

After the backend is live, seed the database once:

1. On your **local machine**, open `server/.env`
2. Set `DATABASE_URL` to the same Supabase URI from Step 1
3. Run:
   ```bash
   cd server
   node src/db/seed.js
   ```
4. You should see: `✅  Seed complete.`

> This inserts 36 students, 8 teachers, 24 parents, attendance, marks, fees, and all other demo data.
> It is safe to run again — all inserts use `ON CONFLICT DO NOTHING`.

---

## Step 5 — Deploy the Frontend (Static site)

1. Open `client/.env.production`
2. Replace the placeholder with your backend URL from Step 3:
   ```
   VITE_API_URL=https://school-api.aletcloud.app
   ```
3. Build the client:
   ```bash
   cd client
   npm install
   npm run build
   ```
   This produces the `client/dist/` folder.

4. Back in Aletcloud → **New Service → Static Site**
5. Connect the same GitHub repo
6. Set the **Root directory** to `client`
7. Set the **Build command** to:
   ```
   npm install && npm run build
   ```
8. Set the **Publish directory** to `dist`
9. Add environment variable:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://school-api.aletcloud.app` |

10. Click **Deploy**
11. You will get a URL like `https://school-ui.aletcloud.app` — that is your live app.

---

## Step 6 — Test the Live App

Open your frontend URL and log in with any of these accounts:

| Username | Password | Role |
|---|---|---|
| `admin` | `school123` | Full access |
| `teacher` | `school123` | Teaching staff view |
| `student` | `school123` | Student self-view |
| `parent` | `school123` | Parent/guardian view |

---

## File Reference

```
school-management/
├── client/
│   ├── .env.production        ← set VITE_API_URL here
│   └── src/api/index.js       ← reads VITE_API_URL at build time
└── server/
    ├── .env                   ← local dev variables (never commit real secrets)
    ├── package.json           ← includes pg@8.12.0
    └── src/
        ├── data.js            ← re-exports from db/index.js (routes unchanged)
        ├── db/
        │   ├── index.js       ← PostgreSQL pool + shared helpers
        │   ├── schema.sql     ← run once in Supabase SQL Editor
        │   └── seed.js        ← run once locally after schema is applied
        └── index.js           ← verifies DB connection before starting server
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `❌ Database connection failed` | Check `DATABASE_URL` in Aletcloud env vars — no trailing spaces |
| `SSL required` error | Already handled — `rejectUnauthorized: false` is set for production |
| Frontend shows blank / network error | Make sure `VITE_API_URL` is set **before** the build runs |
| Login fails | Check `DEMO_PASSWORD` env var matches what you seeded with |
| Data is empty | Run `node src/db/seed.js` from your local machine with the real `DATABASE_URL` |
| Node version error | Set runtime to Node 18+ in Aletcloud service settings |
