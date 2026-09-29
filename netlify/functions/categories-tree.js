// GET /api/categories/tree -> árbol del menú: categorías activas, sus subcategorías y las marcas
// derivadas de los productos con stock. Con token de admin y ?all=1 incluye lo inactivo.
import { error, handle, isAuthed, json } from '../lib/http.js';
import { buildTree } from '../lib/taxonomy.js';

export default handle(async (req) => {
  if (req.method !== 'GET') return error('Método no permitido.', 405);
  const includeInactive = new URL(req.url).searchParams.get('all') === '1' && isAuthed(req);
  return json(await buildTree({ includeInactive }));
});
