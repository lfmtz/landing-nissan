import crypto from 'node:crypto';
import { HttpError } from './errors.js';

const MAX_ACCOUNTS = 5;
const apiBase = () => process.env.CLOUDINARY_API_BASE || 'https://api.cloudinary.com';

/* ------------------------------ cuentas ------------------------------ */

export function getAccounts() {
  const list = [];
  for (let i = 1; i <= MAX_ACCOUNTS; i++) {
    const cloudName = process.env[`CLOUD_${i}_NAME`];
    const apiKey = process.env[`CLOUD_${i}_KEY`];
    const apiSecret = process.env[`CLOUD_${i}_SECRET`];
    if (!cloudName || !apiKey || !apiSecret) continue;
    list.push({
      id: String(i),
      label: process.env[`CLOUD_${i}_LABEL`] || cloudName,
      cloudName,
      apiKey,
      apiSecret,
      mode: (process.env[`CLOUD_${i}_MODE`] || '').toLowerCase(),
    });
  }
  return list;
}

export function getAccount(id) {
  const acc = getAccounts().find((a) => a.id === String(id));
  if (!acc) throw new HttpError(400, 'Cuenta no encontrada');
  return acc;
}

/* ------------------------------ helpers ------------------------------ */

const BAD_SEGMENT = /[\\&,?%#<>\u0000-\u001f]/;

/** Normaliza y valida una ruta de folder ("a/b/c"). '' = raíz. */
export function cleanPath(input) {
  const raw = String(input ?? '').trim();
  const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (p === '.' || p === '..' || BAD_SEGMENT.test(p)) {
      throw new HttpError(400, `Nombre de folder no válido: "${p}"`);
    }
  }
  return parts.join('/');
}

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

async function admin(acc, method, path, query = []) {
  const url = new URL(`${apiBase()}/v1_1/${encodeURIComponent(acc.cloudName)}${path}`);
  for (const [k, v] of query) if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v);
  const auth = Buffer.from(`${acc.apiKey}:${acc.apiSecret}`).toString('base64');
  const r = await fetch(url, { method, headers: { Authorization: `Basic ${auth}` } });
  const text = await r.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* respuesta no JSON */
  }
  if (!r.ok) {
    const msg = json?.error?.message || `Cloudinary respondió ${r.status}`;
    throw new HttpError(r.status === 401 || r.status === 403 ? 502 : r.status >= 500 ? 502 : r.status, msg);
  }
  return json;
}

/* ------------------------- modo de folders ------------------------- */

const modeCache = new Map();

/** 'dynamic' (asset_folder) o 'fixed' (folder en el public_id). */
export async function folderMode(acc) {
  if (acc.mode === 'dynamic' || acc.mode === 'fixed') return acc.mode;
  const key = acc.cloudName;
  if (modeCache.has(key)) return modeCache.get(key);
  let mode = 'dynamic';
  try {
    const cfg = await admin(acc, 'GET', '/config', [['settings', 'true']]);
    if (cfg?.settings?.folder_mode === 'fixed') mode = 'fixed';
  } catch {
    /* si falla la detección se asume dynamic (lo normal en cuentas nuevas) */
  }
  modeCache.set(key, mode);
  return mode;
}

/* ------------------------------ folders ------------------------------ */

export async function listFolders(acc, path) {
  const folders = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const json = await admin(acc, 'GET', path ? `/folders/${encPath(path)}` : '/folders', [
      ['max_results', 100],
      ['next_cursor', cursor],
    ]);
    for (const f of json.folders || []) folders.push({ name: f.name, path: f.path });
    cursor = json.next_cursor;
    if (!cursor) break;
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  return folders;
}

export async function createFolder(acc, path) {
  if (!path) throw new HttpError(400, 'Indica el nombre del folder');
  const json = await admin(acc, 'POST', `/folders/${encPath(path)}`);
  return { name: json.name || path.split('/').pop(), path: json.path || path };
}

/* ------------------------------ imágenes ------------------------------ */

function mapResource(r) {
  return {
    id: r.public_id,
    url: r.secure_url,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    format: r.format,
    createdAt: r.created_at,
  };
}

export async function listResources(acc, path, cursor) {
  if (!path) return { resources: [], nextCursor: null };
  const mode = await folderMode(acc);
  if (mode === 'dynamic') {
    const json = await admin(acc, 'GET', '/resources/by_asset_folder', [
      ['asset_folder', path],
      ['max_results', 60],
      ['next_cursor', cursor],
    ]);
    return {
      resources: (json.resources || []).filter((r) => r.resource_type === 'image').map(mapResource),
      nextCursor: json.next_cursor || null,
    };
  }
  const prefix = `${path}/`;
  const json = await admin(acc, 'GET', '/resources/image/upload', [
    ['prefix', prefix],
    ['max_results', 100],
    ['next_cursor', cursor],
  ]);
  return {
    resources: (json.resources || [])
      .filter((r) => !r.public_id.slice(prefix.length).includes('/')) // solo hijos directos
      .map(mapResource),
    nextCursor: json.next_cursor || null,
  };
}

export async function deleteResources(acc, publicIds) {
  if (!Array.isArray(publicIds) || publicIds.length === 0) throw new HttpError(400, 'No hay imágenes para eliminar');
  if (publicIds.length > 100) throw new HttpError(400, 'Máximo 100 imágenes por solicitud');
  const query = publicIds.map((id) => ['public_ids[]', String(id)]);
  query.push(['invalidate', 'true']); // limpia también el caché del CDN
  const json = await admin(acc, 'DELETE', '/resources/image/upload', query);
  return { deleted: json.deleted || {} };
}

/* --------------------------- subida firmada --------------------------- */

export async function signUpload(acc, path) {
  if (!path) throw new HttpError(400, 'Elige un folder antes de subir');
  const mode = await folderMode(acc);
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { [mode === 'fixed' ? 'folder' : 'asset_folder']: path };
  const toSign = { ...params, timestamp };
  const str = Object.keys(toSign)
    .sort()
    .map((k) => `${k}=${toSign[k]}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(str + acc.apiSecret).digest('hex');
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(acc.cloudName)}/image/upload`,
    apiKey: acc.apiKey,
    timestamp,
    signature,
    params,
  };
}
