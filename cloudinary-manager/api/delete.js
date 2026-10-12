import { route, getBody } from './_lib/http.js';
import { getAccount, deleteResources } from './_lib/cloudinary.js';

// POST /api/delete {account, publicIds: [...]}
export default route({ methods: ['POST'] }, async (req) => {
  const { account, publicIds } = getBody(req);
  return deleteResources(getAccount(account), publicIds);
});
