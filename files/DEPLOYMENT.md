# AutomateX — Deployment & Feature Guide

## What's new in v2

| Feature | Details |
|---|---|
| 🔐 Admin dashboard | `/admin.html` — login, view & manage bookings, inquiries, reviews |
| ✅ Booking approval | Approve or cancel bookings from the dashboard |
| 📧 Email notifications | Client gets confirmation; you get instant alert on every booking & inquiry |
| 🛡️ Review moderation | New reviews are `pending` until you publish them |
| 🔑 Token auth | Admin routes protected — no public access |

---

## Step 1 — MongoDB Atlas (free database)

1. Go to https://cloud.mongodb.com and create a free account.
2. Create a **free M0 cluster** (any region).
3. Under **Database Access** → add a user with a strong password.
4. Under **Network Access** → add `0.0.0.0/0` (allow all IPs for simplicity, or restrict to your host IP).
5. Click **Connect → Drivers** and copy the connection string. It looks like:

```
mongodb+srv://youruser:yourpass@cluster0.abcde.mongodb.net/automatex?retryWrites=true&w=majority
```

---

## Step 2 — Deploy backend to Render (free)

1. Push your project to GitHub.
2. Go to https://render.com → **New → Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** Node
5. Add these **environment variables** in Render's dashboard:

```
MONGODB_URI        = (your Atlas connection string)
ADMIN_USERNAME     = admin
ADMIN_PASSWORD     = (a strong password you choose)
ADMIN_SECRET       = (any long random string)
ADMIN_EMAIL        = your@email.com
ADMIN_URL          = https://your-app-name.onrender.com/admin.html

# Email – Gmail example:
EMAIL_HOST         = smtp.gmail.com
EMAIL_PORT         = 587
EMAIL_SECURE       = false
EMAIL_USER         = your@gmail.com
EMAIL_PASS         = (Gmail App Password – see below)
EMAIL_FROM         = AutomateX <your@gmail.com>
```

6. Click **Deploy**. Render gives you a URL like `https://automatex-xxxx.onrender.com`.

### Gmail App Password setup
1. Enable 2-Factor Authentication on your Google account.
2. Go to https://myaccount.google.com/apppasswords
3. Create an app password for "Mail" → copy the 16-character code.
4. Use that as `EMAIL_PASS` — **not** your regular Gmail password.

---

## Step 3 — Update your frontend API URL

In `app.js`, line 1:
```js
// Before (localhost only):
const API_BASE = "/api";

// After deployment, keep as "/api" — Render serves both frontend and API.
// No change needed if you deploy to Render (same origin).
```

If you deploy the **frontend separately** (Vercel/Netlify), change it to:
```js
const API_BASE = "https://your-app-name.onrender.com/api";
```

---

## Step 4 — Access your admin dashboard

Visit:
```
https://your-app-name.onrender.com/admin.html
```

Login with the `ADMIN_USERNAME` and `ADMIN_PASSWORD` you set in Render.

---

## API reference (new admin endpoints)

All admin endpoints require `Authorization: Bearer <token>` header.

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/login` | Get auth token |
| GET | `/api/admin/bookings` | List all bookings |
| PATCH | `/api/admin/bookings/:id` | Update booking status |
| GET | `/api/admin/inquiries` | List all inquiries |
| PATCH | `/api/admin/inquiries/:id` | Mark inquiry as read |
| DELETE | `/api/admin/inquiries/:id` | Delete inquiry |
| GET | `/api/admin/reviews` | List all reviews |
| PATCH | `/api/admin/reviews/:id` | Publish/reject review |
| DELETE | `/api/admin/reviews/:id` | Delete review |

---

## Optional — Deploy frontend to Vercel

If you want the frontend on Vercel while the backend stays on Render:

1. Push only the frontend files (`index.html`, `style.css`, `app.js`) to a repo.
2. In `app.js` set `const API_BASE = "https://your-app.onrender.com/api";`
3. Import the repo into https://vercel.com → deploy.
4. On Render, update CORS to allow your Vercel domain:

```js
// In server.js, replace:
app.use(cors());
// With:
app.use(cors({ origin: ["https://your-site.vercel.app", "http://localhost:5000"] }));
```

---

## Development (local)

```bash
npm install
cp .env.example .env
# Fill in .env (leave EMAIL_HOST blank to use Ethereal test emails)
npm run dev
```

Open http://localhost:5000  
Admin: http://localhost:5000/admin.html
