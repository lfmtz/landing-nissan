import { route } from './_lib/http.js';
import { getAccount, cleanPath, listResources } from './_lib/cloudinary.js';

// GET /api/resources?account=1&folder=a/b&cursor=...
export default route({ methods: ['GET'] }, async (req) => {
  const acc = getAccount(req.query?.account);
  const folder = cleanPath(req.query?.folder);
  return listResources(acc, folder, req.query?.cursor);
});
