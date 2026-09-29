# ÚNICA LENCERÍA · Portal Mayorista

Sitio web del mayorista de lencería **ÚNICA LENCERÍA** (Rosario, Santa Fe): tienda pública one-page con catálogo por marca, novedades, carrusel de marcas y pedidos por WhatsApp, más un **panel de administración** para gestionar artículos, portadas y marcas.

- **Frontend:** Vite (multi-página, JS vanilla con módulos ES) + Tailwind CSS v3.
- **Backend:** Netlify Functions + Netlify Blobs (datos e imágenes).
- **Diseño:** basado en el export de Google Stitch (`DESIGN.md`): Playfair Display + Plus Jakarta Sans, paleta frambuesa.

## Pedido por WhatsApp (carrito)

Cada artículo tiene su **ficha** (`#producto/<id>`, se abre desde la foto, el título o el botón "Elegir y pedir") con todas sus fotos, la descripción, el precio del pack y la elección de **un color, un talle** (obligatorios si el artículo los tiene) y la cantidad de packs. "Agregar al pedido" suma esa combinación; para otro color o talle se vuelve a elegir y agregar (queda en otra línea). El pedido se abre desde el botón de la bolsa (header) o la píldora flotante "Ver pedido":

- Una línea por combinación de colores/talles, cantidades editables y total estimado.
- Precio único: el del pack (es lo que se muestra en la tienda y se cobra en el pedido).
- Barra de progreso hacia la compra mínima; el envío se habilita al alcanzarla.
- Datos opcionales: nombre/comercio, localidad, entrega (retiro en sucursal o expreso) y aclaraciones.
- **Enviar pedido por WhatsApp** abre `wa.me` con el mensaje armado con todo el detalle.
- El pedido se guarda en el navegador (`localStorage`) hasta que se vacía.

## Menú de categorías (☰)

El botón de 3 líneas (arriba a la derecha) abre un menú lateral que se arma desde `GET /api/categories/tree`, nunca desde HTML fijo:

1. **Categorías principales** (Mujeres, Hombre, Niño/a…) → **subcategorías** (Conjuntos, Bikinis…) → **marcas** de esa subcategoría.
2. **Ver todas las marcas**: todas las marcas registradas, para filtrar el catálogo por marca.

Las marcas **no se asignan a mano**: una marca aparece en una subcategoría (y en su categoría) si hay al menos un artículo **con stock** de esa marca con esa subcategoría. Al cargar o editar un artículo, su marca se suma sola al menú.

Elegir una opción filtra el catálogo y deja la URL compartible: `/?categoria=mujeres&subcategoria=conjuntos&marca=kaury`.

### Modelo de datos (Netlify Blobs)

| Colección       | Campos                                                          |
| --------------- | --------------------------------------------------------------- |
| `categories`    | `id`, `name`, `slug`, `order`, `isActive`                        |
| `subcategories` | `id`, `categoryId` → categoría, `name`, `slug`, `order`, `isActive` |
| `brands`        | `id`, `name`, `logo`, `initials`, `category`                     |
| `articles`      | … + `subcategoryId` → subcategoría, `brandId` → marca (se resuelve por nombre) |

La primera vez se siembra el árbol inicial (Mujeres, Hombre y Niño/a con sus subcategorías) y los artículos existentes se migran solos a su subcategoría.

## Estructura

```
index.html                 Tienda pública
admin/index.html           Panel de administración (/admin)
src/config.js              WhatsApp, Instagram y compra mínima (única fuente de verdad)
src/store/                 JS y CSS de la tienda (cart.js: pedido; product.js: ficha; menu.js: menú ☰)
src/admin/                 JS y CSS del panel (categories.js: gestión de categorías)
src/shared/utils.js        Escape de HTML, cliente de la API, helpers
src/shared/tree.js         Árbol categorías → subcategorías → marcas (compartido API/tienda)
src/data/seed.js           Datos iniciales (se siembran en Blobs la primera vez)
netlify/functions/         auth, articles, brands, banners, categories, subcategories,
                           categories-tree, upload, images
netlify/lib/               Token HMAC, validación, acceso a Blobs, taxonomía
public/img/                Imágenes del diseño en WebP
tailwind.config.js         Tema de la tienda
tailwind.admin.config.js   Tema del panel (paleta distinta)
```

## Correr en local

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env        # completar ADMIN_PASSWORD y ADMIN_SECRET
npm run dev                 # = npx netlify-cli dev → http://localhost:8888
```

`netlify dev` levanta Vite y las Functions juntos, con un store de Blobs local (en `.netlify/`). Con `npm run dev:vite` solo se levanta el frontend: la tienda funciona con los datos iniciales, pero el admin no.

Para generar un `ADMIN_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Variables de entorno

| Variable         | Uso                                                              |
| ---------------- | ---------------------------------------------------------------- |
| `ADMIN_PASSWORD` | Contraseña para entrar al panel `/admin`.                        |
| `ADMIN_SECRET`   | Secreto (≥ 32 caracteres) para firmar los tokens de sesión HMAC. |

Nunca se commitea un `.env` real (está en `.gitignore`).

## Panel de administración

Entrar a **`/admin`** e ingresar la contraseña (`ADMIN_PASSWORD`). La sesión dura 12 horas (token firmado guardado en `sessionStorage`); tras 8 intentos fallidos el login se bloquea 15 minutos.

- **Publicaciones & Artículos:** crear, editar, eliminar, buscar, filtrar por marca, marcar como Novedad y pausar stock. Hasta 5 fotos por artículo (JPG/PNG/WebP ≤ 4 MB, se redimensionan a 1200 px en el navegador).
- **Categorías & Subcategorías:** crear, renombrar, reordenar (↑ ↓), mostrar/ocultar y eliminar categorías principales y subcategorías; una subcategoría se puede mover a otra categoría desde "Editar". Eliminar una categoría borra sus subcategorías y deja sus artículos "sin categoría" (pide escribir el nombre para confirmar). Cada artículo debe tener una subcategoría.
- **Portadas & Banners:** subir/reemplazar imagen, editar textos, activar/desactivar. La **Portada Inicio** activa reemplaza la imagen principal de la tienda.
- **Carrusel de Marcas:** agregar marcas con logo. Eliminar pide doble confirmación.
- **Pedidos:** próximamente (hoy muestra datos de ejemplo).

Los cambios se ven en la tienda al recargarla.

## API

Las rutas `/api/*` se reescriben a `/.netlify/functions/*`.

| Método | Ruta                    | Auth | Descripción                         |
| ------ | ----------------------- | ---- | ----------------------------------- |
| POST   | `/api/auth`             | –    | Login → `{ token, expiresAt }`      |
| GET    | `/api/articles`         | –    | Lista de artículos                  |
| POST/PUT/DELETE | `/api/articles[?id=]` | ✔ | Alta / edición parcial / baja     |
| GET    | `/api/brands`           | –    | Marcas del carrusel                 |
| POST/DELETE | `/api/brands[?id=]` | ✔   | Alta / baja                         |
| GET    | `/api/banners`          | –    | Portadas activas (todas con token)  |
| POST/PUT/DELETE | `/api/banners[?id=]` | ✔ | Alta / edición / baja             |
| GET    | `/api/categories/tree`  | –    | Árbol del menú con marcas derivadas (`?all=1` con token incluye lo oculto) |
| GET    | `/api/categories`       | –    | Categorías (activas; todas con token) |
| POST/PUT/DELETE | `/api/categories[?id=]` | ✔ | Alta / edición / baja (con cascada) |
| POST   | `/api/categories?action=reorder` | ✔ | `{ ids }` nuevo orden          |
| GET    | `/api/subcategories[?categoryId=]` | – | Subcategorías                 |
| POST/PUT/DELETE | `/api/subcategories[?id=]` | ✔ | Alta / edición o mover / baja |
| POST   | `/api/subcategories?action=reorder` | ✔ | `{ categoryId, ids }`       |
| POST   | `/api/upload`           | ✔    | Sube una imagen → `{ url }`         |
| GET    | `/api/images?key=`      | –    | Sirve imágenes subidas (cache 1 año)|

## Despliegue (Netlify)

El sitio está conectado al repo de GitHub: **cada push a `main` despliega automáticamente**. La conexión usa una *deploy key* de solo lectura en el repo y un webhook de GitHub (evento `push`) hacia Netlify; se ven en *Settings → Deploy keys / Webhooks* del repo.

Para un sitio nuevo:

```bash
npx netlify-cli login
npx netlify-cli init                          # vincula el repo y configura el build
npx netlify-cli env:set ADMIN_PASSWORD "..."
npx netlify-cli env:set ADMIN_SECRET "..."
npx netlify-cli deploy --build --prod         # deploy manual opcional
```

La configuración de build, redirects y headers de seguridad (CSP, X-Frame-Options, Referrer-Policy) está en `netlify.toml`.

## Cambiar datos de contacto

WhatsApp, Instagram y la compra mínima están en `src/config.js`. En el build se reemplazan en el HTML los marcadores `{{WA_NUMBER}}`, `{{MIN_PURCHASE}}`, etc. (ver `vite.config.js`).
