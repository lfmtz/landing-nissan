import { route, getBody } from './_lib/http.js';
import { getAccount, cleanPath, listFolders, createFolder } from './_lib/cloudinary.js';

// GET  /api/folders?account=1&path=a/b   -> subfolders de "a/b" (vacío = raíz)
// POST /api/folders {account, path}      -> crea el folder (incluye subfolders "a/b/c")
export default route({ methods: ['GET', 'POST'] }, async (req) => {
  if (req.method === 'GET') {
    const acc = getAccount(req.query?.account);
    const path = cleanPath(req.query?.path);
    return { path, folders: await listFolders(acc, path) };
  }
  const body = getBody(req);
  const acc = getAccount(body.account);
  const path = cleanPath(body.path);
  return { folder: await createFolder(acc, path) };
});
