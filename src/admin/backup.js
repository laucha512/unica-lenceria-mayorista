// Copia de seguridad: un Excel con todo lo que se carga en el admin (una hoja por tema).
// Los datos se piden de nuevo al servidor en el momento, así la copia queda al día.
// Las fotos no van adentro del archivo: cada artículo lleva los links de sus fotos.
import { SITE_URL } from '../config.js';
import { combos, comboKey } from '../shared/stock.js';
import { buildWorkbook, saveBlob } from '../shared/xlsx.js';

const yesNo = (v) => (v ? 'Sí' : 'No');
const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
const photoLink = (src) => (/^https?:/.test(src) ? src : `${SITE_URL}${src}`);
const STATUS = { nuevo: 'Nuevo', en_preparacion: 'En preparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' };

/**
 * call: función del admin para pedir datos con la sesión.
 * subcategoryPath: "Categoría › Subcategoría" de un artículo.
 * buildClients: clientes armados desde los pedidos.
 */
export async function downloadBackup({ call, subcategoryPath, buildClients }) {
  const [articles, brands, categories, subcategories, branches, banners, orders, contact] = await Promise.all([
    call('articles'),
    call('brands'),
    call('categories'),
    call('subcategories'),
    call('branches'),
    call('banners'),
    call('orders'),
    call('settings'),
  ]);

  const soldOutText = (a) => {
    const out = new Set(a.soldOut || []);
    return combos(a)
      .filter((c) => out.has(comboKey(c.size, c.color)))
      .map((c) => [c.size, c.color].filter(Boolean).join(' '))
      .join(', ');
  };
  const bySizeText = (a) =>
    Object.entries(a.colorsBySize || {})
      .map(([size, colors]) => `${size}: ${colors.join(', ')}`)
      .join(' | ');

  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const sheets = [
    {
      name: 'Artículos',
      intro: [`ÚNICA LENCERÍA – Copia de seguridad del ${dateTime(new Date().toISOString())}`, `${articles.length} artículos`],
      header: ['Marca', 'Código', 'Título', 'Descripción', 'Categoría', 'Otras categorías', 'Presentación', 'Tipo de venta', 'Talles', 'Colores', 'Colores por talle', 'Agotados', 'Precio pack', 'Precio unidad', 'Precio oferta', 'Novedad', 'Con stock', 'Fotos', 'Creado', 'Actualizado'],
      rows: articles.map((a) => [
        a.brand,
        a.code || '',
        a.title,
        a.description || '',
        subcategoryPath(a.subcategoryId) || '',
        (a.extraSubcategoryIds || []).map(subcategoryPath).filter(Boolean).join(' + '),
        a.presentation || '',
        a.saleType || '',
        (a.sizes || []).join(', '),
        (a.colors || []).join(', '),
        bySizeText(a),
        soldOutText(a),
        a.pricePack || 0,
        a.priceUnit || 0,
        a.offerPrice || 0,
        yesNo(a.isNew),
        yesNo(a.inStock),
        (a.images || []).map(photoLink).join(' '),
        dateTime(a.createdAt),
        dateTime(a.updatedAt),
      ]),
      widths: [14, 10, 44, 40, 28, 28, 16, 18, 22, 30, 30, 24, 12, 12, 12, 9, 9, 60, 17, 17],
      money: [12, 13, 14],
    },
    {
      name: 'Pedidos',
      header: ['N°', 'Código', 'Fecha', 'Estado', 'Cliente', 'WhatsApp', 'Localidad', 'Entrega', 'Aclaraciones', 'Packs', 'Armados', 'Total', 'Armó'],
      rows: orders.map((o) => [
        o.number,
        o.code,
        dateTime(o.createdAt),
        STATUS[o.status] || o.status,
        o.info?.name || '',
        o.info?.phone || (o.phone ? `+${o.phone}` : ''),
        o.info?.city || '',
        o.info?.delivery || 'A coordinar',
        o.info?.notes || '',
        o.packs || 0,
        (o.items || []).reduce((n, l) => n + (l.prepared || 0), 0),
        o.total || 0,
        o.preparedByName || '',
      ]),
      widths: [6, 9, 17, 15, 24, 20, 18, 34, 34, 8, 9, 13, 18],
      money: [11],
    },
    {
      name: 'Detalle de pedidos',
      header: ['N° pedido', 'Código', 'Marca', 'Art.', 'Artículo', 'Colores', 'Talles', 'Cantidad', 'Armados', 'Precio', 'Subtotal', 'Agregado'],
      rows: orders.flatMap((o) =>
        (o.items || []).map((l) => [
          o.number,
          o.code,
          l.brand,
          l.code || '',
          l.title,
          (l.colors || []).join(', ') || 'Surtidos',
          (l.sizes || []).join(', ') || 'Curva completa',
          l.qty,
          l.prepared || 0,
          l.price || 0,
          l.subtotal || 0,
          dateTime(l.addedAt || o.createdAt),
        ])
      ),
      widths: [10, 9, 14, 10, 44, 20, 16, 9, 9, 12, 13, 17],
      money: [9, 10],
    },
    {
      name: 'Clientes',
      header: ['Nombre', 'WhatsApp', 'Localidad', 'Pedidos', 'Packs', 'Total comprado', 'Primer pedido', 'Último pedido'],
      rows: buildClients(orders).map((c) => [c.name || '', c.phoneDisplay || `+${c.phone}`, c.city || '', c.orders.length, c.packs, c.total, dateTime(c.first), dateTime(c.last)]),
      widths: [26, 20, 18, 9, 8, 15, 17, 17],
      money: [5],
    },
    {
      name: 'Marcas',
      header: ['Nombre', 'Iniciales', 'Rubro', 'Logo'],
      rows: brands.map((b) => [b.name, b.initials || '', b.category || '', b.logo ? photoLink(b.logo) : '']),
      widths: [22, 10, 24, 50],
    },
    {
      name: 'Categorías',
      header: ['Categoría', 'Subcategoría', 'Orden', 'Activa'],
      rows: [
        ...categories.map((c) => [c.name, '', c.order ?? '', yesNo(c.isActive)]),
        ...subcategories.map((s) => [catName.get(s.categoryId) || '', s.name, s.order ?? '', yesNo(s.isActive)]),
      ],
      widths: [22, 26, 8, 8],
    },
    {
      name: 'Sucursales',
      header: ['Nombre', 'Subtítulo', 'Dirección (mapa)', 'Horarios', 'Descripción', 'Destacado', 'Casa central', 'Activa'],
      rows: branches.map((b) => [
        b.name,
        b.subtitle || '',
        b.mapQuery || '',
        (b.hours || []).map((h) => `${h.days ? `${h.days}: ` : ''}${h.hours}`).join(' | '),
        b.description || '',
        b.highlight || '',
        yesNo(b.isMain),
        yesNo(b.active),
      ]),
      widths: [22, 30, 32, 44, 44, 30, 12, 8],
    },
    {
      name: 'Configuración',
      header: ['Dato', 'Valor'],
      rows: [
        ['WhatsApp', contact.whatsappDisplay],
        ['Instagram', `@${contact.instagramUser}`],
        ['Web', SITE_URL],
        ['Portada de inicio activa', banners.find((b) => b.active)?.title || ''],
        ['Foto de portada', banners.find((b) => b.active)?.image ? photoLink(banners.find((b) => b.active).image) : ''],
        ['Fecha de la copia', dateTime(new Date().toISOString())],
      ],
      widths: [26, 60],
    },
  ];

  saveBlob(buildWorkbook(sheets), `copia-de-seguridad-unica-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return { articles: articles.length, orders: orders.length };
}
