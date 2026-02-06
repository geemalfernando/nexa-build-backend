# NexaBuild Backend (Express + MongoDB)

## Setup

1) Install deps:

```bash
npm install
```

2) Create `.env`:

```bash
cp .env.example .env
```

Set:
- `DATABASE_URL` (MongoDB connection string)
- `JWT_SECRET` (long random string)
- `CLIENT_ORIGIN` (optional; comma-separated allowed origins for CORS)

## MongoDB Atlas notes

- You don’t need to “create the database” manually in Atlas. The database in your connection string (example: `...mongodb.net/lion_car_sale`) will appear in Atlas after the first write (e.g. after a successful signup).
- If the server can’t connect, check Atlas:
  - **Database Access**: your DB user exists and has read/write permissions.
  - **Network Access**: your IP is allowed (for local dev you can temporarily allow `0.0.0.0/0`).
  - If your password has special characters, URL-encode it in `DATABASE_URL`.

3) Run:

```bash
npm run dev
```

Health check: `GET http://localhost:5001/health` (or whatever you set in `PORT`)

## Deploy to Vercel (Serverless)

This repo includes `api/index.js` + `vercel.json` so Vercel routes all requests to the Express app.

In Vercel → Project → Settings → Environment Variables, set:
- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_ORIGIN` (your Firebase URL, e.g. `https://nexa-build.web.app`)

After deploy, health check:
- `GET https://<your-backend>.vercel.app/health`

## Auth

- `POST /api/auth/signup` → `{ name, email, password }`
- `POST /api/auth/login` → `{ email, password }`
- `GET /api/auth/me` (Bearer token)

## Rooms

- `POST /api/rooms` (Bearer token) → `{ name }`
- `GET /api/rooms` (Bearer token)
- `POST /api/rooms/join` (Bearer token) → `{ code }`
- `GET /api/rooms/:roomId` (Bearer token)

## Projects (per room)

- `POST /api/rooms/:roomId/projects` (Bearer token) → `{ name, description? }`
- `GET /api/rooms/:roomId/projects` (Bearer token)

## All Projects (for current user)

- `GET /api/projects` (Bearer token) → returns all projects you can access, including `myProgress`

## Project State (save what user designed)

- `GET /api/projects/:projectId/state` (Bearer token)
- `PUT /api/projects/:projectId/state` (Bearer token) → `{ width?, length?, furniture?, floorPlan? }`
- `PATCH /api/projects/:projectId/state` (Bearer token) → merges fields

## Progress (per user, per project)

- `PUT /api/projects/:projectId/progress` (Bearer token) → `{ percent?, status?, notes? }`
- `GET /api/projects/:projectId/progress/me` (Bearer token)
- `GET /api/projects/:projectId/progress` (Bearer token; lists all members' progress)
