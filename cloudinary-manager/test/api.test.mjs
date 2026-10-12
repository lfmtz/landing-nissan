import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.APP_PASSWORD = 'secreta123';
process.env.AUTH_SECRET = 'x'.repeat(40);
process.env.CLOUD_1_NAME = 'demo-uno';
process.env.CLOUD_1_KEY = 'key1';
process.env.CLOUD_1_SECRET = 'sec1';
process.env.CLOUD_1_LABEL = 'Jeep';
process.env.CLOUD_1_MODE = 'dynamic';
process.env.CLOUD_2_NAME = 'demo-dos';
process.env.CLOUD_2_KEY = 'key2';
process.env.CLOUD_2_SECRET = 'sec2';
process.env.CLOUD_2_MODE = 'fixed';

const login = (await import('../api/login.js')).default;
const accounts = (await import('../api/accounts.js')).default;
const folders = (await import('../api/folders.js')).default;
const resources = (await import('../api/resources.js')).default;
const del = (await import('../api/delete.js')).default;
const sign = (await import('../api/sign-upload.js')).default;

function call(handler, { method = 'GET', query = {}, body, token } = {}) {
  return new Promise((resolve) => {
    const res = {
      code: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(o) { resolve({ status: this.code, body: o, headers: this.headers }); },
    };
    handler({ method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  });
}

let calls;
let reply;
beforeEach(() => {
  calls = [];
  reply = { status: 200, json: {} };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(reply.json), { status: reply.status });
  };
});

async function getToken() {
  const r = await call(login, { method: 'POST', body: { password: 'secreta123' } });
  assert.equal(r.status, 200);
  return r.body.token;
}

test('login: contraseña incorrecta -> 401, correcta -> token', async () => {
  const bad = await call(login, { method: 'POST', body: { password: 'nope' } });
  assert.equal(bad.status, 401);
  assert.ok(await getToken());
});

test('login: solo POST', async () => {
  const r = await call(login, { method: 'GET' });
  assert.equal(r.status, 405);
});

test('rutas protegidas rechazan sin token o con token alterado', async () => {
  assert.equal((await call(accounts)).status, 401);
  const t = await getToken();
  assert.equal((await call(accounts, { token: t + 'x' })).status, 401);
  assert.equal((await call(accounts, { token: 'a.b' })).status, 401);
});

test('accounts: lista las configuradas y NUNCA expone key/secret', async () => {
  const r = await call(accounts, { token: await getToken() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.accounts.map((a) => a.id), ['1', '2']);
  assert.equal(r.body.accounts[0].label, 'Jeep');
  const raw = JSON.stringify(r.body);
  assert.ok(!raw.includes('sec1') && !raw.includes('key1') && !raw.includes('sec2'));
});

test('folders GET: raíz y subfolder, con auth básica hacia Cloudinary', async () => {
  reply.json = { folders: [{ name: 'Zeta', path: 'Zeta' }, { name: 'alfa', path: 'alfa' }] };
  const t = await getToken();
  const r = await call(folders, { query: { account: '1' }, token: t });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.folders.map((f) => f.name), ['alfa', 'Zeta']);
  assert.equal(calls[0].url.pathname, '/v1_1/demo-uno/folders');
  assert.equal(calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('key1:sec1').toString('base64'));

  await call(folders, { query: { account: '1', path: 'Autos/Ram 1500' }, token: t });
  assert.equal(calls[1].url.pathname, '/v1_1/demo-uno/folders/Autos/Ram%201500');
});

test('folders GET: sigue la paginación de Cloudinary', async () => {
  let n = 0;
  globalThis.fetch = async (url) => {
    calls.push({ url: new URL(url) });
    n++;
    const body = n === 1
      ? { folders: [{ name: 'a', path: 'a' }], next_cursor: 'C2' }
      : { folders: [{ name: 'b', path: 'b' }] };
    return new Response(JSON.stringify(body));
  };
  const r = await call(folders, { query: { account: '1' }, token: await getToken() });
  assert.equal(r.body.folders.length, 2);
  assert.equal(calls[1].url.searchParams.get('next_cursor'), 'C2');
});

test('folders POST: crea folder y rechaza rutas peligrosas', async () => {
  reply.json = { success: true, path: 'Nuevo/Sub', name: 'Sub' };
  const t = await getToken();
  const ok = await call(folders, { method: 'POST', body: { account: '1', path: '/Nuevo//Sub/' }, token: t });
  assert.equal(ok.status, 200);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].url.pathname, '/v1_1/demo-uno/folders/Nuevo/Sub');

  const before = calls.length;
  for (const bad of ['../x', 'a/../b', 'a?b', 'a#b', 'a%b']) {
    const r = await call(folders, { method: 'POST', body: { account: '1', path: bad }, token: t });
    assert.equal(r.status, 400, bad);
  }
  assert.equal((await call(folders, { method: 'POST', body: { account: '1', path: '' }, token: t })).status, 400);
  assert.equal(calls.length, before, 'no debe llamar a Cloudinary con rutas inválidas');
});

test('cuenta inexistente -> 400', async () => {
  const r = await call(folders, { query: { account: '9' }, token: await getToken() });
  assert.equal(r.status, 400);
});

test('resources (modo dynamic): usa by_asset_folder y solo imágenes', async () => {
  reply.json = {
    resources: [
      { public_id: 'p1', secure_url: 'https://x/p1.jpg', resource_type: 'image', width: 10, height: 20, bytes: 5, format: 'jpg', created_at: 't' },
      { public_id: 'v1', secure_url: 'https://x/v1.mp4', resource_type: 'video' },
    ],
    next_cursor: 'NEXT',
  };
  const r = await call(resources, { query: { account: '1', folder: 'Autos' }, token: await getToken() });
  assert.equal(calls[0].url.pathname, '/v1_1/demo-uno/resources/by_asset_folder');
  assert.equal(calls[0].url.searchParams.get('asset_folder'), 'Autos');
  assert.equal(r.body.resources.length, 1);
  assert.equal(r.body.resources[0].id, 'p1');
  assert.equal(r.body.nextCursor, 'NEXT');
});

test('resources (modo fixed): usa prefix y filtra solo hijos directos', async () => {
  reply.json = {
    resources: [
      { public_id: 'Autos/a', secure_url: 'u1' },
      { public_id: 'Autos/sub/b', secure_url: 'u2' },
    ],
  };
  const r = await call(resources, { query: { account: '2', folder: 'Autos' }, token: await getToken() });
  assert.equal(calls[0].url.pathname, '/v1_1/demo-dos/resources/image/upload');
  assert.equal(calls[0].url.searchParams.get('prefix'), 'Autos/');
  assert.deepEqual(r.body.resources.map((x) => x.id), ['Autos/a']);
});

test('resources en la raíz no consulta Cloudinary', async () => {
  const r = await call(resources, { query: { account: '1', folder: '' }, token: await getToken() });
  assert.deepEqual(r.body, { resources: [], nextCursor: null });
  assert.equal(calls.length, 0);
});

test('sign-upload: firma SHA-1 correcta según el modo de folders', async () => {
  const t = await getToken();
  const r1 = await call(sign, { method: 'POST', body: { account: '1', folder: 'Autos/Jeep' }, token: t });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body.params, { asset_folder: 'Autos/Jeep' });
  const expected1 = crypto.createHash('sha1')
    .update(`asset_folder=Autos/Jeep&timestamp=${r1.body.timestamp}sec1`).digest('hex');
  assert.equal(r1.body.signature, expected1);
  assert.equal(r1.body.uploadUrl, 'https://api.cloudinary.com/v1_1/demo-uno/image/upload');
  assert.equal(r1.body.apiKey, 'key1');
  assert.ok(!JSON.stringify(r1.body).includes('sec1'));

  const r2 = await call(sign, { method: 'POST', body: { account: '2', folder: 'Autos' }, token: t });
  assert.deepEqual(r2.body.params, { folder: 'Autos' });
  const expected2 = crypto.createHash('sha1')
    .update(`folder=Autos&timestamp=${r2.body.timestamp}sec2`).digest('hex');
  assert.equal(r2.body.signature, expected2);

  assert.equal((await call(sign, { method: 'POST', body: { account: '1', folder: '' }, token: t })).status, 400);
});

test('delete: envía public_ids[] con método DELETE y valida entrada', async () => {
  reply.json = { deleted: { p1: 'deleted', p2: 'deleted' } };
  const t = await getToken();
  const r = await call(del, { method: 'POST', body: { account: '1', publicIds: ['p1', 'p2'] }, token: t });
  assert.equal(r.status, 200);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.deepEqual(calls[0].url.searchParams.getAll('public_ids[]'), ['p1', 'p2']);
  assert.equal(calls[0].url.searchParams.get('invalidate'), 'true');
  assert.equal((await call(del, { method: 'POST', body: { account: '1', publicIds: [] }, token: t })).status, 400);
});

test('errores de Cloudinary se traducen a mensajes claros', async () => {
  reply = { status: 401, json: { error: { message: 'Invalid credentials' } } };
  const r = await call(folders, { query: { account: '1' }, token: await getToken() });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'Invalid credentials');
});
