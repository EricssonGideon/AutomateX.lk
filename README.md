# AutomateX Full-Stack Booking Website

This project now includes a real client-server booking flow:

- The frontend in `index.html`, `style.css`, and `app.js` collects booking details.
- The browser sends them to the backend with a JSON `POST` request.
- The backend in `server.js` uses Express to validate the request.
- MongoDB stores the booking in the `bookings` collection through Mongoose.
- The server returns a confirmation response back to the client.

## Project structure

- `index.html`: landing page and booking UI
- `style.css`: visual design and responsive layout
- `app.js`: frontend behavior and booking API integration
- `server.js`: Express server and API routes
- `models/Booking.js`: Mongoose booking schema
- `.env.example`: sample environment variables

## Setup

1. Install Node.js on your machine.
2. Open the project folder in a terminal.
3. Install dependencies:

```bash
npm install
```

4. Copy `.env.example` to `.env`.
5. Set your MongoDB connection string and `JWT_SECRET` in `.env`.
6. Start the server:

```bash
npm run dev
```

Or for production:

```bash
npm start
```

7. Open your local server URL, for example [http://localhost:5001/login.html](http://localhost:5001/login.html) when `PORT=5001`.

## API

### `GET /api/health`

Returns the API and database status.

### `GET /api/bookings/availability?month=YYYY-MM`

Returns booked date and time slot keys for the selected month.

### `POST /api/bookings`

Example request body:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+94 71 123 4567",
  "service": "Website Development",
  "date": "2026-04-25",
  "time": "10:30"
}
```

## Notes

- Weekend dates are blocked in the frontend calendar.
- Duplicate bookings for the same date and time are prevented in the API and the database index.
- If you open `index.html` directly without running the Node server, the booking form UI will appear, but live booking submission will not work because the API will not be running.

## Deployment preflight checklist

Before deploying to Vercel, confirm the required environment variables are configured in the Vercel project settings.

1. In Vercel, open the AutomateX project.
2. Go to Settings -> Environment Variables.
3. Add each required variable for Production, Preview, and Development unless a value is intentionally environment-specific.
4. Redeploy after adding or changing environment variables. Existing deployments do not automatically pick up changed values.

Required variables:

- `MONGO_URI`: MongoDB connection string. This must point to the correct production database because database-backed features such as login, dashboard data, bookings, reviews, and admin tools depend on it.
- `JWT_SECRET`: Long, private signing secret for authentication tokens. Use a strong random value and never reuse a public, short, or guessable string.
- `ALLOWED_ORIGINS`: Comma-separated browser origins allowed to call the API. Production should include `https://automatex.lk,https://www.automatex.lk`.

Optional variables, depending on enabled features:

- `OPENAI_API_KEY`: Required only when OpenAI-backed chatbot behavior is enabled.
- `OPENAI_CHAT_ENABLED`: Enables or disables OpenAI-backed chat behavior when the app is configured to use it.
- Stripe billing variables, required only when billing is enabled:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_STARTER_PRICE_ID`
  - `STRIPE_STANDARD_PRICE_ID`
  - `STRIPE_PRO_PRICE_ID`

Security checks:

- Never commit real secrets, API keys, JWT secrets, webhook secrets, or database connection strings to GitHub.
- Keep production secrets in Vercel Environment Variables, not in source files.
- After deployment, test `/api/health`, login, and dashboard flows with the production environment selected.

## DEV_NOTES

- Do not open `login.html`, `admin-login.html`, or `client-login.html` with `file://`. Real authentication needs the backend API.
- Start the backend server first with a valid `.env` file and a working MongoDB connection.
- For local auth testing, use `http://localhost:5001/login.html` when `PORT=5001`, or the matching local server URL for your configured port.
- Real signup and login require both the backend server and MongoDB to be connected.
- `JWT_SECRET` is required locally. The app no longer falls back to a default development secret.
