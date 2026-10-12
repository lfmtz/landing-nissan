import { route, getBody } from './_lib/http.js';
import { getAccount, cleanPath, signUpload } from './_lib/cloudinary.js';

// POST /api/sign-upload {account, folder}
// Devuelve la firma para que el navegador suba la foto DIRECTO a Cloudinary
// (el API secret nunca sale del servidor).
export default route({ methods: ['POST'] }, async (req) => {
  const { account, folder } = getBody(req);
  return signUpload(getAccount(account), cleanPath(folder));
});
