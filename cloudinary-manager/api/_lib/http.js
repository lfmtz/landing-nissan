import { HttpError } from './errors.js';
import { requireAuth } from './auth.js';

export function getBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      throw new HttpError(400, 'Cuerpo JSON inválido');
    }
  }
  return b;
}

/**
 * Envuelve un handler: valida método, autenticación y unifica errores.
 * fn(req) devuelve el objeto JSON de respuesta.
 */
export function route({ methods, auth = true }, fn) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'Método no permitido');
      }
      if (auth) requireAuth(req);
      const out = await fn(req);
      res.status(200).json(out);
    } catch (e) {
      const known = e instanceof HttpError;
      if (!known) console.error(e);
      res.status(known ? e.status : 500).json({ error: known ? e.message : 'Error interno del servidor' });
    }
  };
}
