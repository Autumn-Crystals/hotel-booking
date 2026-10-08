// server.js – Main Express application for Hotel Booking System
// Handles all routes: auth, rooms, bookings
// Serves static files from the /public folder

const express        = require('express');
const session        = require('express-session');
const bcrypt         = require('bcryptjs');
const path           = require('path');
const db             = require('./db');      // Import DB connection (also runs table creation + seed)

const app  = express();
const PORT = 3000;

// ─────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────

// Parse incoming JSON request bodies (needed for POST/PUT routes)
app.use(express.json());

// Serve all files in /public as static assets (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware – keeps users logged in across requests
// In production you'd use a persistent session store; for demo, memory store is fine
app.use(session({
  secret: 'hotel-booking-secret-key-2024',  // Used to sign the session cookie
  resave: false,                             // Don't resave session if unchanged
  saveUninitialized: false,                  // Don't create session until something is stored
  cookie: { maxAge: 1000 * 60 * 60 * 24 }  // Session expires after 24 hours
}));

// ─────────────────────────────────────────────
//  MIDDLEWARE HELPERS
// ─────────────────────────────────────────────

// requireLogin: blocks unauthenticated access to guest and admin routes
// Attaches req.user for convenience in route handlers
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    // 401 = Unauthorized (user is not logged in)
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  // Fetch fresh user data from DB and attach to request
  req.user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.session.userId);
  if (!req.user) {
    return res.status(401).json({ error: 'Session invalid. Please log in again.' });
  }
  next(); // User is valid – proceed to the actual route handler
}

// requireAdmin: extends requireLogin to also block non-admin users
function requireAdmin(req, res, next) {
  requireLogin(req, res, () => {
    if (req.user.role !== 'admin') {
      // 403 = Forbidden (logged in but not allowed)
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next(); // User is an admin – proceed
  });
}

// ─────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────

// POST /api/auth/register – Create a new guest account
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  // Validate: all fields must be present
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }

  // Validate: basic email format check
  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  // Validate: password length
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Check if email is already registered
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    // 409 = Conflict (resource already exists)
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Hash the password before storing (bcryptjs, cost factor 10)
  const hash = bcrypt.hashSync(password, 10);

  // Insert new user – role is always 'guest' (admin only via seed)
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, 'guest')
  `).run(name.trim(), email.toLowerCase().trim(), hash);

  // Start a session for the new user immediately (auto-login after register)
  req.session.userId = result.lastInsertRowid;

  res.status(201).json({ message: 'Account created successfully!', role: 'guest' });
});

// POST /api/auth/login – Authenticate user and start session
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  // Validate: both fields must be present
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // Look up user by email (case-insensitive)
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    // Use a generic message – don't reveal whether email exists (security best practice)
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Compare the provided password against the stored hash
  const passwordMatch = bcrypt.compareSync(password, user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Store user ID in session so future requests know who is logged in
  req.session.userId = user.id;

  // Return the user's role so the frontend can redirect to the right page
  res.json({ message: 'Login successful!', role: user.role, name: user.name });
});

// POST /api/auth/logout – Destroy the session
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out successfully.' });
  });
});

// GET /api/auth/me – Return current user info (used by navbar to show name + role)
app.get('/api/auth/me', requireLogin, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role, email: req.user.email });
});

// ─────────────────────────────────────────────
//  GUEST ROUTES
// ─────────────────────────────────────────────

// GET /api/rooms/available – Search for rooms that are free for the given date range
// Two bookings overlap if: new_check_in < existing_check_out AND new_check_out > existing_check_in
// Back-to-back bookings (one checkout == next checkin) are ALLOWED by this formula
app.get('/api/rooms/available', requireLogin, (req, res) => {
  const { type, checkIn, checkOut } = req.query;

  // Validate: dates must be provided
  if (!checkIn || !checkOut) {
    return res.status(400).json({ error: 'Check-in and check-out dates are required.' });
  }

  // Validate: check_out must be after check_in
  if (checkOut <= checkIn) {
    return res.status(400).json({ error: 'Check-out date must be after check-in date.' });
  }

  // Validate: check_in cannot be in the past (compare as strings – YYYY-MM-DD is lexicographically sortable)
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  if (checkIn < today) {
    return res.status(400).json({ error: 'Check-in date cannot be in the past.' });
  }

  // Build the SQL query – find rooms with NO overlapping booking
  // The subquery finds room IDs that ARE booked; we select rooms NOT in that list
  let query = `
    SELECT * FROM rooms
    WHERE id NOT IN (
      SELECT room_id FROM bookings
      WHERE check_in < ? AND check_out > ?
    )
  `;
  const params = [checkOut, checkIn];

  // Optionally filter by room type (if provided and not 'all')
  if (type && type !== 'all') {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY type, price';

  const rooms = db.prepare(query).all(...params);
  res.json(rooms);
});

// POST /api/bookings – Book a room for the logged-in guest
app.post('/api/bookings', requireLogin, (req, res) => {
  const { roomId, checkIn, checkOut } = req.body;
  const userId = req.user.id;

  // Validate: all fields required
  if (!roomId || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'Room ID, check-in and check-out are required.' });
  }

  // Validate: dates
  if (checkOut <= checkIn) {
    return res.status(400).json({ error: 'Check-out date must be after check-in date.' });
  }
  const today = new Date().toISOString().split('T')[0];
  if (checkIn < today) {
    return res.status(400).json({ error: 'Check-in date cannot be in the past.' });
  }

  // Check the room exists
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // CRITICAL: Re-check for overlap before inserting (search may be stale)
  // This prevents double-booking if two users searched at the same time
  const overlap = db.prepare(`
    SELECT id FROM bookings
    WHERE room_id = ? AND check_in < ? AND check_out > ?
  `).get(roomId, checkOut, checkIn);

  if (overlap) {
    // 409 = Conflict (room already booked for these dates)
    return res.status(409).json({ error: 'Room is not available for these dates.' });
  }

  // Calculate total price on the server (never trust client-provided price)
  // Date difference in milliseconds -> convert to days
  const msPerDay    = 1000 * 60 * 60 * 24;
  const nights      = Math.round((new Date(checkOut) - new Date(checkIn)) / msPerDay);
  const totalPrice  = nights * room.price;

  // Insert the booking
  const result = db.prepare(`
    INSERT INTO bookings (room_id, user_id, check_in, check_out, total_price)
    VALUES (?, ?, ?, ?, ?)
  `).run(roomId, userId, checkIn, checkOut, totalPrice);

  res.status(201).json({
    message: 'Booking confirmed!',
    bookingId: result.lastInsertRowid,
    totalPrice,
    nights
  });
});

// GET /api/bookings/mine – Return all bookings for the logged-in guest
app.get('/api/bookings/mine', requireLogin, (req, res) => {
  // Join with rooms table to get room details alongside booking info
  const bookings = db.prepare(`
    SELECT b.id, b.check_in, b.check_out, b.total_price,
           r.room_no, r.type, r.price as price_per_night
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    WHERE b.user_id = ?
    ORDER BY b.check_in DESC
  `).all(req.user.id);

  res.json(bookings);
});

// DELETE /api/bookings/:id – Cancel a booking
// Guests can only cancel their OWN bookings; admins can cancel any booking
app.delete('/api/bookings/:id', requireLogin, (req, res) => {
  const bookingId = Number(req.params.id);

  // Find the booking first
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  // If the requester is a guest, they can only cancel their own bookings
  if (req.user.role === 'guest' && booking.user_id !== req.user.id) {
    // 403 = Forbidden
    return res.status(403).json({ error: 'You can only cancel your own bookings.' });
  }

  // Delete the booking
  db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
  res.json({ message: 'Booking cancelled successfully.' });
});

// ─────────────────────────────────────────────
//  ADMIN ROUTES
// ─────────────────────────────────────────────

// GET /api/rooms – Return all rooms with their availability status for today
app.get('/api/rooms', requireAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // For each room, check if there is a booking that covers today
  const rooms = db.prepare(`
    SELECT r.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.room_id = r.id AND b.check_in <= ? AND b.check_out > ?
      ) THEN 'Booked' ELSE 'Available' END AS status_today
    FROM rooms r
    ORDER BY r.room_no
  `).all(today, today);

  res.json(rooms);
});

// POST /api/rooms – Add a new room
app.post('/api/rooms', requireAdmin, (req, res) => {
  const { room_no, type, price, description } = req.body;

  // Validate: all fields required
  if (!room_no || !type || !price) {
    return res.status(400).json({ error: 'Room number, type and price are required.' });
  }

  // Validate: type must be one of the allowed values
  if (!['Single', 'Double', 'Suite'].includes(type)) {
    return res.status(400).json({ error: 'Type must be Single, Double or Suite.' });
  }

  // Validate: price must be a positive number
  if (isNaN(price) || Number(price) <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number.' });
  }

  // Check for duplicate room number
  const existing = db.prepare('SELECT id FROM rooms WHERE room_no = ?').get(room_no.trim());
  if (existing) {
    return res.status(409).json({ error: `Room number ${room_no} already exists.` });
  }

  const result = db.prepare(`
    INSERT INTO rooms (room_no, type, price, description)
    VALUES (?, ?, ?, ?)
  `).run(room_no.trim(), type, Number(price), (description || '').trim());

  res.status(201).json({ message: 'Room added successfully!', roomId: result.lastInsertRowid });
});

// PUT /api/rooms/:id – Update room details
app.put('/api/rooms/:id', requireAdmin, (req, res) => {
  const roomId = Number(req.params.id);
  const { room_no, type, price, description } = req.body;

  // Validate fields
  if (!room_no || !type || !price) {
    return res.status(400).json({ error: 'Room number, type and price are required.' });
  }
  if (!['Single', 'Double', 'Suite'].includes(type)) {
    return res.status(400).json({ error: 'Type must be Single, Double or Suite.' });
  }
  if (isNaN(price) || Number(price) <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number.' });
  }

  // Check the room exists
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Check for duplicate room number (excluding this room itself)
  const duplicate = db.prepare('SELECT id FROM rooms WHERE room_no = ? AND id != ?').get(room_no.trim(), roomId);
  if (duplicate) {
    return res.status(409).json({ error: `Room number ${room_no} is already used by another room.` });
  }

  db.prepare(`
    UPDATE rooms SET room_no = ?, type = ?, price = ?, description = ? WHERE id = ?
  `).run(room_no.trim(), type, Number(price), (description || '').trim(), roomId);

  res.json({ message: 'Room updated successfully!' });
});

// DELETE /api/rooms/:id – Delete a room (blocked if it has future bookings)
app.delete('/api/rooms/:id', requireAdmin, (req, res) => {
  const roomId = Number(req.params.id);
  const today  = new Date().toISOString().split('T')[0];

  // Check the room exists
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  // Block deletion if room has future bookings (would leave orphaned bookings)
  const futureBooking = db.prepare(`
    SELECT id FROM bookings WHERE room_id = ? AND check_out > ?
  `).get(roomId, today);

  if (futureBooking) {
    // 409 = Conflict
    return res.status(409).json({ error: 'Cannot delete room with active or upcoming bookings.' });
  }

  db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
  res.json({ message: 'Room deleted successfully.' });
});

// GET /api/bookings – Return ALL bookings with guest name and room number (admin view)
app.get('/api/bookings', requireAdmin, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.id, b.check_in, b.check_out, b.total_price,
           r.room_no, r.type,
           u.name AS guest_name, u.email AS guest_email
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    JOIN users u ON u.id = b.user_id
    ORDER BY b.check_in DESC
  `).all();

  res.json(bookings);
});

// GET /api/stats – Dashboard stats for admin
app.get('/api/stats', requireAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // Total number of rooms in the hotel
  const totalRooms = db.prepare('SELECT COUNT(*) as cnt FROM rooms').get().cnt;

  // Number of bookings that are active right now (check_in <= today < check_out)
  const activeBookings = db.prepare(`
    SELECT COUNT(*) as cnt FROM bookings
    WHERE check_in <= ? AND check_out > ?
  `).get(today, today).cnt;

  // Occupancy percentage = (rooms booked today / total rooms) * 100
  const occupancy = totalRooms > 0 ? Math.round((activeBookings / totalRooms) * 100) : 0;

  // Total revenue from all bookings (past and future combined)
  const revenueRow = db.prepare('SELECT SUM(total_price) as total FROM bookings').get();
  const totalRevenue = revenueRow.total || 0;

  res.json({ totalRooms, activeBookings, occupancy, totalRevenue });
});

// ─────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n Hotel Booking System running at http://localhost:${PORT}`);
  console.log(` Login page: http://localhost:${PORT}/login.html\n`);
});
