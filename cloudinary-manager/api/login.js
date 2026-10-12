import { route, getBody } from './_lib/http.js';
import { checkPassword, issueToken } from './_lib/auth.js';
import { HttpError } from './_lib/errors.js';

export default route({ methods: ['POST'], auth: false }, async (req) => {
  const { password } = getBody(req);
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600)); // frena intentos de fuerza bruta
    throw new HttpError(401, 'Contraseña incorrecta');
  }
  return { token: issueToken() };
});
