require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set in .env — using an insecure default. Set one before deploying.');
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'habit-ledger.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_data (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL DEFAULT '{"habits":[],"completions":{}}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---------- Helpers ----------
function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- Auth routes ----------
app.post('/api/signup', (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const info = db.prepare(
    'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)'
  ).run(normalizedEmail, name.trim(), passwordHash);

  db.prepare('INSERT INTO user_data (user_id, data) VALUES (?, ?)')
    .run(info.lastInsertRowid, JSON.stringify({ habits: [], completions: {} }));

  const user = { id: info.lastInsertRowid, email: normalizedEmail, name: name.trim() };
  const token = signToken(user);
  res.status(201).json({ token, user });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const user = { id: row.id, email: row.email, name: row.name };
  const token = signToken(user);
  res.json({ token, user });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: row });
});

// ---------- Data routes ----------
app.get('/api/data', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT data FROM user_data WHERE user_id = ?').get(req.userId);
  if (!row) return res.json({ habits: [], completions: {} });
  res.json(JSON.parse(row.data));
});

app.put('/api/data', authMiddleware, (req, res) => {
  const { habits, completions } = req.body || {};
  if (!Array.isArray(habits) || typeof completions !== 'object' || completions === null) {
    return res.status(400).json({ error: 'Malformed data payload.' });
  }
  const data = JSON.stringify({ habits, completions });
  db.prepare(`
    INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(req.userId, data);
  res.json({ ok: true });
});

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Habit Ledger server running on http://localhost:${PORT}`);
});
