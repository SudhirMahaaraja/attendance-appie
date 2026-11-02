# Attendance Tracker

A personal office attendance and leave tracking app. Stack: HTML + Bootstrap 5 + Vanilla JS (Vercel) + Node.js/Express (Render) + MongoDB Atlas.

---

## Local Development

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your MongoDB Atlas URI in .env
npm run dev
```

Server runs at `http://localhost:5000`.

### Frontend

Open `frontend/index.html` in a browser **or** serve it with any static server:

```bash
npx serve frontend
```

In `frontend/js/app.js`, set the `API` constant to `http://localhost:5000/api/attendance` while developing locally.

---

## Deployment

### 1. MongoDB Atlas (free tier)

1. Create a free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user and whitelist `0.0.0.0/0` (allow all IPs — needed for Render).
3. Copy the connection string — you'll need it as `MONGODB_URI`.

### 2. Backend → Render (free tier)

1. Push `backend/` to a GitHub repository.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables:
   - `MONGODB_URI` — your Atlas connection string
   - `FRONTEND_URL` — your Vercel app URL (e.g. `https://your-app.vercel.app`)
   - `PORT` — leave blank (Render sets it automatically)

> **Free-tier note:** Render free services spin down after 15 minutes of inactivity. The first request after a spin-down takes ~30 seconds. This is normal.

### 3. Frontend → Vercel (free tier)

1. Push `frontend/` to GitHub (same or separate repo).
2. Import project on [vercel.com](https://vercel.com) — point root to `frontend/`.
3. No build step needed (static HTML).
4. In `frontend/js/app.js`, update the `API` constant to your Render service URL **before** pushing.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/attendance`           | All records (triggers backfill) |
| `GET`    | `/api/attendance/summary`   | Leave count summary |
| `GET`    | `/api/attendance/:date`     | Single record by date |
| `POST`   | `/api/attendance/checkin`   | Check in for today |
| `POST`   | `/api/attendance/leave`     | Apply leave (CL / SL / LOP) |
| `PATCH`  | `/api/attendance/:date/note`   | Update note on any record |
| `PATCH`  | `/api/attendance/:date/status` | Override status on a past record |

---

## Auto-leave Rule

Every time the frontend loads, it calls `GET /api/attendance`. The backend then scans all weekdays between the first ever record and yesterday. Any day with no record is automatically marked as **absent**. Weekends are marked as **weekend**.

The 10:30 AM cut-off is surfaced as a live warning in the UI — if you open the app after 10:30 and haven't checked in, a red warning appears. The day will be backfilled as absent when tomorrow arrives.

