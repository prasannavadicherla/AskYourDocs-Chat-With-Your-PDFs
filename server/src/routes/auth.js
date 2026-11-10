const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign } = require('../auth');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!EMAIL.test(email || '') || (password || '').length < 8)
      return res.status(400).json({ error: 'Valid email and password of 8+ characters required' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email',
      [email.toLowerCase(), hash]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Email already registered' });
    res.status(201).json({ token: sign(rows[0]), user: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [
      (email || '').toLowerCase(),
    ]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: sign(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
