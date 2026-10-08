// db.js – Database setup for Hotel Booking System
// Uses Node.js built-in 'node:sqlite' (available in Node.js >= 22.5)
// No external npm packages needed for the database layer!
// API is synchronous, just like better-sqlite3.

const { DatabaseSync } = require('node:sqlite');  // Built-in module – no npm install
const bcrypt           = require('bcryptjs');
const path             = require('path');

// Open (or create) the SQLite database file in the project root
const db = new DatabaseSync(path.join(__dirname, 'hotel.db'));

// Enable foreign key enforcement – SQLite disables them by default
db.exec('PRAGMA foreign_keys = ON');
// WAL mode improves concurrent read performance
db.exec('PRAGMA journal_mode = WAL');

// ─────────────────────────────────────────────
//  CREATE TABLES (only if they don't exist yet)
// ─────────────────────────────────────────────

// users table: stores both guests and the admin
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'guest'
                          CHECK(role IN ('guest', 'admin'))
  );
`);

// rooms table: each room has a unique room number, type, price, and description
// Availability is NOT stored here – it is computed from bookings
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_no     TEXT    NOT NULL UNIQUE,
    type        TEXT    NOT NULL CHECK(type IN ('Single', 'Double', 'Suite')),
    price       REAL    NOT NULL,
    description TEXT    NOT NULL DEFAULT ''
  );
`);

// bookings table: links a user to a room for a date range
// check_in and check_out stored as 'YYYY-MM-DD' strings
// total_price computed server-side (never trusted from client)
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id     INTEGER NOT NULL REFERENCES rooms(id)  ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    check_in    TEXT    NOT NULL,
    check_out   TEXT    NOT NULL,
    total_price REAL    NOT NULL
  );
`);

// ─────────────────────────────────────────────
//  SEED DATA (runs only once – checks first)
// ─────────────────────────────────────────────

// Helper: check if a table already has rows
function isEmpty(table) {
  // node:sqlite returns objects without prototype; access properties directly
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();
  return Number(row.cnt) === 0;
}

// Seed users – only if the table is empty
if (isEmpty('users')) {
  console.log('[DB] Seeding users...');

  // Hash passwords synchronously (bcryptjs supports sync hashing)
  const adminHash = bcrypt.hashSync('admin123', 10);
  const guestHash = bcrypt.hashSync('guest123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);

  // One admin account (cannot be created via register – only via seed)
  insertUser.run('Admin User', 'admin@hotel.com', adminHash, 'admin');
  // One demo guest account for testing
  insertUser.run('Guest User', 'guest@hotel.com', guestHash, 'guest');

  console.log('[DB] Users seeded: admin@hotel.com / admin123, guest@hotel.com / guest123');
}

// Seed rooms – only if the table is empty
if (isEmpty('rooms')) {
  console.log('[DB] Seeding rooms...');

  const insertRoom = db.prepare(`
    INSERT INTO rooms (room_no, type, price, description)
    VALUES (?, ?, ?, ?)
  `);

  // 3 Single rooms (budget-friendly)
  insertRoom.run('101', 'Single', 1200, 'Cozy single room with city view, free Wi-Fi and breakfast included.');
  insertRoom.run('102', 'Single', 1100, 'Compact single room on a quiet floor, ideal for solo travelers.');
  insertRoom.run('103', 'Single', 1300, 'Bright single room with queen bed, work desk and en-suite shower.');

  // 3 Double rooms (mid-range)
  insertRoom.run('201', 'Double', 2200, 'Spacious double room with king bed, sofa seating and pool-facing balcony.');
  insertRoom.run('202', 'Double', 2000, 'Elegant double room with twin beds, ideal for friends or colleagues.');
  insertRoom.run('203', 'Double', 2400, 'Premium double room with Jacuzzi, panoramic windows and mini-bar.');

  // 2 Suites (luxury)
  insertRoom.run('301', 'Suite',  5000, 'Grand suite with separate living room, king bed, butler service and rooftop access.');
  insertRoom.run('302', 'Suite',  4500, 'Executive suite with home-theater, private terrace and in-room dining.');

  console.log('[DB] 8 rooms seeded (3 Single, 3 Double, 2 Suite)');
}

// Export the database connection so server.js can use it
module.exports = db;
