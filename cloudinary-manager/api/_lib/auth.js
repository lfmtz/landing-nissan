import crypto from 'node:crypto';
import { HttpError } from './errors.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new HttpError(500, 'Falta AUTH_SECRET (mínimo 16 caracteres) en las variables de entorno');
  }
  return s;
}

const b64 = (v) => Buffer.from(v).toString('base64url');
const hmac = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(input) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new HttpError(500, 'Falta APP_PASSWORD en las variables de entorno');
  return safeEqual(input ?? '', expected);
}

export function issueToken() {
  const body = b64(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
  return `${body}.${hmac(body)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  if (!safeEqual(sig, hmac(body))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAuth(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!verifyToken(token)) throw new HttpError(401, 'Sesión no válida. Inicia sesión de nuevo.');
}
