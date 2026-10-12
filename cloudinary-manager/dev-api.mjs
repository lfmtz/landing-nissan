// Servidor local que expone las funciones de /api igual que Vercel.
// Uso: npm run dev   (levanta esto + Vite)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Carga .env sin dependencias
try {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch {
  console.warn('⚠️  No se encontró .env — copia .env.example a .env y complétalo.');
}

const PORT = Number(process.env.API_PORT || 3001);
const routes = {};
for (const f of fs.readdirSync('api')) {
  if (f.endsWith('.js')) routes[`/api/${f.slice(0, -3)}`] = pathToFileURL(path.resolve('api', f)).href;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const target = routes[url.pathname];
  if (!target) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'No encontrado' }));
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  if (raw && (req.headers['content-type'] || '').includes('json')) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = undefined;
    }
  }
  const shim = Object.assign(req, { query: Object.fromEntries(url.searchParams), body });
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  try {
    const mod = await import(target);
    await mod.default(shim, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

server.listen(PORT, () => console.log(`API local en http://localhost:${PORT}`));
