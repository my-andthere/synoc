/**
 * SYNOC — authentication routes.
 */
import { Router } from 'express';
import { query, queryOne, execute } from '../db.js';
import {
  requireAuth, verifyPassword, signToken, hashPassword, findUserByUsername,
} from '../auth.js';

export const authRouter = Router();

/** POST /api/auth/login */
authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await findUserByUsername(String(username).trim());
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    await execute(
      `INSERT INTO audit_log (entity, entity_id, action, changes, created_by)
       VALUES ('users', ?, 'login', ?, ?)`,
      [String(user.id), JSON.stringify({ username: user.username }), user.id]
    );

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me */
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await queryOne(
      `SELECT id, username, full_name, email, phone, role, department, is_active, last_login_at
         FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/users — list staff (for the assignment dropdown). */
authRouter.get('/users', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, username, full_name, email, role, department, is_active, last_login_at
         FROM users
        ${req.query.active_only === '1' ? 'WHERE is_active = 1' : ''}
        ORDER BY full_name`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/users — create user (admin only). */
authRouter.post('/users', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Requires role: admin' });
    }
    const { username, full_name, email, password, role, department, phone } = req.body || {};
    if (!username || !full_name || !email || !password) {
      return res.status(400).json({ error: 'username, full_name, email and password are required' });
    }
    const hash = await hashPassword(String(password));
    const result = await execute(
      `INSERT INTO users (username, full_name, email, phone, password_hash, role, department)
       VALUES (?,?,?,?,?,?,?)`,
      [String(username).trim(), full_name, email, phone ?? null, hash,
       ['admin', 'noc', 'engineer', 'viewer'].includes(role) ? role : 'noc', department ?? null]
    );
    const row = await queryOne(
      `SELECT id, username, full_name, email, phone, role, department, is_active FROM users WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json({ data: row, message: 'User created' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'username or email already exists' });
    }
    next(err);
  }
});

/** POST /api/auth/logout — records the logout in the audit trail. */
authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await execute(
      `INSERT INTO audit_log (entity, entity_id, action, changes, created_by)
       VALUES ('users', ?, 'logout', ?, ?)`,
      [String(req.user.id), JSON.stringify({ username: req.user.username }), req.user.id]
    );
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});
