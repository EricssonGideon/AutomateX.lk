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
5. Set your MongoDB connection string in `.env`.
6. Start the server:

```bash
npm run dev
```

Or for production:

```bash
npm start
```

7. Open [http://localhost:5000](http://localhost:5000)

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
