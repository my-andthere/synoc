/**
 * SYNOC — authentication helpers (JWT + bcrypt).
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { queryOne } from './db.js';

export function hashPassword(plain) {
  return bcrypt.hash(plain, config.auth.bcryptRounds);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.full_name },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );
}

/**
 * Express middleware — requires a valid bearer token.
 * Attaches `req.user = { id, username, role, name }`.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      name: payload.name,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Express middleware — role gate. Usage: requireRole('admin', 'noc')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    return next();
  };
}

/** Load the full user row from the DB (used after login). */
export async function findUserByUsername(username) {
  return queryOne('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
}

export async function findUserById(id) {
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
}
