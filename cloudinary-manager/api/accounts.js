import { route } from './_lib/http.js';
import { getAccounts } from './_lib/cloudinary.js';

// Nunca se devuelven key ni secret al navegador.
export default route({ methods: ['GET'] }, async () => ({
  accounts: getAccounts().map((a) => ({ id: a.id, label: a.label, cloudName: a.cloudName })),
}));
