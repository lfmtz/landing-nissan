const TOKEN_KEY = 'cm_token';

export const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const lsSet = (k, v) => {
  try {
    v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  } catch {
    /* almacenamiento no disponible */
  }
};

export const getToken = () => lsGet(TOKEN_KEY);
export const setToken = (t) => lsSet(TOKEN_KEY, t);
export const clearToken = () => lsSet(TOKEN_KEY, null);

async function request(path, { method = 'GET', body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString()
    : '';
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api/${path}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Sin conexión con el servidor');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* sin cuerpo */
  }
  if (res.status === 401 && path !== 'login') {
    clearToken();
    window.dispatchEvent(new Event('cm:unauthorized'));
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  login: (password) => request('login', { method: 'POST', body: { password } }),
  accounts: () => request('accounts'),
  folders: (account, path) => request('folders', { query: { account, path } }),
  createFolder: (account, path) => request('folders', { method: 'POST', body: { account, path } }),
  resources: (account, folder, cursor) => request('resources', { query: { account, folder, cursor } }),
  remove: (account, publicIds) => request('delete', { method: 'POST', body: { account, publicIds } }),
  signUpload: (account, folder) => request('sign-upload', { method: 'POST', body: { account, folder } }),
};

/* ------------------------- transformaciones ------------------------- */

const withTransform = (url, t) => (url ? url.replace('/upload/', `/upload/${t}/`) : url);
export const thumb = (url) => withTransform(url, 'c_fill,w_360,h_360,q_auto,f_auto');
export const large = (url) => withTransform(url, 'c_limit,w_1800,q_auto,f_auto');

/* ------------------------------ subida ------------------------------ */

/** Reduce fotos de celular (varios MB) antes de subirlas. */
export async function prepareImage(file, maxSide = 2560, quality = 0.86) {
  if (!file.type.startsWith('image/') || /gif|svg/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) {
      bmp.close?.();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // el JPG no tiene transparencia: evita fondo negro en PNG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // formato no soportado por el navegador: se sube tal cual
  }
}

/** Sube a Cloudinary con firma del servidor; reporta progreso 0-100. */
export function uploadToCloudinary(sig, blob, filename, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', blob, filename);
    fd.append('api_key', sig.apiKey);
    fd.append('timestamp', sig.timestamp);
    fd.append('signature', sig.signature);
    for (const [k, v] of Object.entries(sig.params)) fd.append(k, v);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new Error('Falló la conexión al subir'));
    xhr.onload = () => {
      let json = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* no JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          id: json.public_id,
          url: json.secure_url,
          width: json.width,
          height: json.height,
          bytes: json.bytes,
          format: json.format,
          createdAt: json.created_at,
        });
      } else {
        reject(new Error(json?.error?.message || `Cloudinary respondió ${xhr.status}`));
      }
    };
    xhr.send(fd);
  });
}
