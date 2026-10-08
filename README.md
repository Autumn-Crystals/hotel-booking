# 🏨 StayEase Hotel Booking System
> B.Tech CSE Mini-Project | Full-Stack Web Application

A complete Hotel Room Booking System demonstrating CRUD operations, REST APIs, session-based authentication, relational database design, and real-time availability checking.

---

## 🛠️ Tech Stack

| Layer       | Technology                                 |
|-------------|---------------------------------------------|
| Frontend    | HTML5, CSS3, Vanilla JavaScript (Fetch API) |
| Backend     | Node.js + Express                           |
| Database    | SQLite via `node:sqlite` (built-in, Node ≥ 22.5) |
| Auth        | `express-session` + `bcryptjs`              |

---

## ⚡ Quick Start

### Prerequisites
- Node.js **v22.5 or higher** (the project uses the built-in `node:sqlite` module)
- npm

### Install & Run (Zero-Config Setup)

```bash
# 1. Clone the repository
git clone https://github.com/Autumn-Crystals/hotel-booking.git
cd hotel-booking

# 2. Install dependencies (only 3 lightweight packages – no compilation needed!)
npm install

# 3. Start the server
npm start

# 4. Open in browser:
# http://localhost:3000/login.html
```

> **Note:** The SQLite database (`hotel.db`) is automatically created and seeded with 8 demo rooms, guest, and admin accounts on first launch! No manual database setup or SQL imports required.

---

## 🔑 Demo Credentials

| Role  | Email               | Password   |
|-------|---------------------|------------|
| Guest | guest@hotel.com     | guest123   |
| Admin | admin@hotel.com     | admin123   |

---

## 📁 Project Structure

```
hotel-booking/
├── server.js          ← Express app: all routes, middleware, business logic
├── db.js              ← SQLite setup: table creation + seed data
├── package.json
├── hotel.db           ← Auto-created SQLite database file
├── README.md
└── public/
    ├── login.html     ← Login + Register page (tabbed)
    ├── guest.html     ← Guest dashboard: search, book, my bookings
    ├── admin.html     ← Admin panel: stats, rooms CRUD, all bookings
    ├── style.css      ← Shared design system
    ├── login.js       ← Login/register logic
    ├── guest.js       ← Guest page logic
    └── admin.js       ← Admin page logic
```

---

## 🗃️ Database Schema

```sql
-- 3 related tables
users    (id, name, email UNIQUE, password_hash, role)
rooms    (id, room_no UNIQUE, type, price, description)
bookings (id, room_id FK, user_id FK, check_in, check_out, total_price)

-- Availability = computed from bookings (no stored availability column)
-- Two bookings overlap if: new_check_in < existing_check_out
--                      AND new_check_out > existing_check_in
```

---

## 🎯 2-Minute Demo Script (for Viva)

### Step 1 – Register a new guest
1. Go to `http://localhost:3000/login.html`
2. Click **Register** tab
3. Enter any name, new email, password (≥6 chars)
4. Auto-redirects to guest dashboard

### Step 2 – Search and book a room
1. Set Check-In = today, Check-Out = a future date
2. Click **Search Rooms** → see color-coded room cards
3. Click **Book Now** on any room → modal shows dates, nights, total price
4. Click **Confirm Booking** → success toast appears
5. Scroll to **My Bookings** → new booking appears in table

### Step 3 – Demonstrate the overlap edge case
1. Note the room you just booked (e.g., Room 101, Oct 10–15)
2. In same tab, search for Oct 12–18 → Room 101 **does not appear**
3. Search for Oct 15–20 (back-to-back) → Room 101 **does appear** ✅

### Step 4 – Cancel and re-search
1. Click **Cancel** on your booking in My Bookings → confirm with second click
2. Search Oct 10–15 again → Room 101 is back in results ✅

### Step 5 – Admin view
1. Open new tab: `http://localhost:3000/login.html`
2. Login as admin@hotel.com / admin123
3. Dashboard shows: total rooms (8), active bookings, occupancy %, revenue
4. Click **Manage Rooms** → add a new room (e.g., Room 401, Suite, ₹6000)
5. Try to delete a room that has future bookings → see 409 error ✅
6. Click **All Bookings** → see every booking with guest name, room, dates

### Step 6 – Security edge cases to show
- Open a private tab, go to `/admin.html` without logging in → redirected to login
- Login as guest, manually visit `/api/bookings` (admin route) → 403 Forbidden

---

## 🔒 Key API Routes

```
POST /api/auth/register        Create guest account
POST /api/auth/login           Login, get role for redirect
POST /api/auth/logout          Destroy session
GET  /api/auth/me              Current user info

GET  /api/rooms/available      Search rooms (requireLogin)
POST /api/bookings             Book a room (requireLogin)
GET  /api/bookings/mine        My bookings (requireLogin)
DELETE /api/bookings/:id       Cancel (guest=own only, admin=any)

GET  /api/rooms                All rooms + today's status (requireAdmin)
POST /api/rooms                Add room (requireAdmin)
PUT  /api/rooms/:id            Edit room (requireAdmin)
DELETE /api/rooms/:id          Delete room, blocked if future bookings (requireAdmin)
GET  /api/bookings             All bookings with guest info (requireAdmin)
GET  /api/stats                Dashboard numbers (requireAdmin)
```

---

## ✅ Edge Cases Handled

| Edge Case | Behavior |
|-----------|----------|
| Book overlapping dates | 409 – "Room is not available for these dates" |
| Back-to-back stays | Allowed (checkout day = next checkin) |
| Cancel and rebook | Room reappears in search results |
| Cancel non-existent booking | 404 – "Booking not found" |
| Guest accessing admin routes | 403 – "Admin access required" |
| Register duplicate email | 409 – "An account with this email already exists" |
| Delete room with future bookings | 409 – "Cannot delete room with active or upcoming bookings" |
| Past check-in date | 400 – "Check-in date cannot be in the past" |
| Server-side price calculation | Total price always computed from room.price × nights |
