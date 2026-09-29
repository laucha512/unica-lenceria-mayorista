// Datos iniciales extraídos del diseño de Stitch.
// Los usan las Netlify Functions para sembrar Blobs la primera vez
// y la tienda como respaldo si la API no responde.

const daysAgo = (now, d) => new Date(now - d * 86400000).toISOString();

export function seedArticles(now = Date.now()) {
  const base = [
    // Novedades de temporada
    {
      id: 'art-kaury-8240', brand: 'Kaury', code: '8240',
      title: 'Conjunto Triángulo Soft & Puntilla Francesa',
      description: 'Conjunto triángulo soft con puntilla francesa. Presentación en cajas individuales.',
      sizes: ['85', '90', '95', '100'], colors: ['Blanco', 'Negro', 'Nude', 'Borravino'],
      presentation: 'Pack x 6 Unid.', saleType: 'Pack x 6 cajas individuales', tag: '',
      priceUnit: 8450, pricePack: 50700, isNew: true, inStock: true,
      images: ['/img/conjunto-kaury-microfibra-encaje.webp'],
    },
    {
      id: 'art-brillite-5110', brand: 'Brillite', code: '5110',
      title: 'Body Modelador Reductor Satén & Microtul',
      description: 'Body modelador reductor en satén y microtul. Curva especial de talles grandes.',
      sizes: ['90', '95', '100', '105', '110', 'Especiales'], colors: ['Negro', 'Visón', 'Piel'],
      presentation: 'Pack x 4 Curva', saleType: 'Pack x 4 unidades surtidas', tag: '',
      priceUnit: 14200, pricePack: 56800, isNew: true, inStock: true,
      images: ['/img/bralette-brillite-lenceria-fina.webp'],
    },
    {
      id: 'art-natubel-3020', brand: 'Natubel', code: '3020',
      title: 'Camisolín Satén Italiano & Batita Combinada',
      description: 'Camisolín de satén italiano con batita combinada, en estuche listo para vidriera.',
      sizes: ['S', 'M', 'L', 'XL'], colors: ['Champagne', 'Rosa Viejo', 'Negro'],
      presentation: 'Bulto x 6 Unid.', saleType: 'Bulto x 6 estuches listos p/vidriera', tag: '',
      priceUnit: 16800, pricePack: 100800, isNew: true, inStock: true,
      images: ['/img/camisolin-natubel-saten.webp'],
    },
    {
      id: 'art-xy-1205', brand: 'XY Underwear', code: '1205',
      title: 'Boxer Algodón con Lycra y Elástico Bordado',
      description: 'Boxer de algodón con lycra y elástico bordado. Curva completa del 1 al 5.',
      sizes: ['1(S)', '2(M)', '3(L)', '4(XL)', '5(XXL)'], colors: ['Gris Melange', 'Negro', 'Azul Marino'],
      presentation: 'Pack x 12 Unid.', saleType: 'Pack x 12 en cajitas exhibidoras', tag: '',
      priceUnit: 5100, pricePack: 61200, isNew: true, inStock: true,
      images: ['/img/boxer-xy-underwear-pack.webp'],
    },
    // Catálogo por marca
    {
      id: 'art-lody-ld4420', brand: 'Lody', code: 'LD-4420',
      title: 'Conjunto Puntilla Bralette con Colaless Regulable',
      description: 'Bralette de puntilla con colaless regulable.',
      sizes: ['85', '90', '95', '100'], colors: ['Negro', 'Blanco', 'Rojo Rubí'],
      presentation: 'Pack x 6 Unid.', saleType: 'Curva cerrada x 6 unid.', tag: 'Stock Inmediato',
      priceUnit: 9200, pricePack: 55200, isNew: false, inStock: true,
      images: ['/img/conjunto-kaury-microfibra-encaje.webp'],
    },
    {
      id: 'art-g3-108', brand: 'G3', code: 'G3-108',
      title: 'Pack Bombachas Algodón & Modal Seamless',
      description: 'Bombachas seamless de algodón y modal, colores surtidos.',
      sizes: ['1(S)', '2(M)', '3(L)', '4(XL)'], colors: ['Blanco', 'Hueso', 'Gris', 'Negro'],
      presentation: 'Pack x 12 Unid.', saleType: 'Pack x 12 unidades cerradas', tag: 'Alta Rotación',
      priceUnit: 2950, pricePack: 35400, isNew: false, inStock: true,
      images: ['/img/pack-bombachas-g3-algodon.webp'],
    },
    {
      id: 'art-belen-bl705', brand: 'Belén', code: 'BL-705',
      title: 'Corpiño Reductor con Aro & Base Reforzada',
      description: 'Corpiño reductor con aro y base reforzada. Copa C y D.',
      sizes: ['90', '95', '100', '105', '110', '115', '120'], colors: ['Visón', 'Blanco', 'Negro', 'Piel'],
      presentation: 'Pack x 6 Unid.', saleType: 'Pack x 6 curva talles grandes', tag: 'Especial Reductor',
      priceUnit: 11800, pricePack: 70800, isNew: false, inStock: true,
      images: ['/img/bralette-brillite-lenceria-fina.webp'],
    },
    {
      id: 'art-acrobata-ac912', brand: 'Acróbata', code: 'AC-912',
      title: 'Top Primer Corpiño Juvenil Algodón Suave',
      description: 'Top primer corpiño de algodón suave, línea teen en colores pastel.',
      sizes: ['12', '14', '16', '80/85'], colors: ['Rosa', 'Celeste', 'Blanco', 'Melange'],
      presentation: 'Pack x 6 Unid.', saleType: 'Pack x 6 unidades surtidas', tag: 'Línea Teen',
      priceUnit: 4800, pricePack: 28800, isNew: false, inStock: true,
      images: ['/img/top-acrobata-juvenil.webp'],
    },
    {
      id: 'art-xy-1510', brand: 'XY Underwear', code: 'XY-1510',
      title: 'Boxer Sin Costura Microfibra Elastizada',
      description: 'Boxer sin costura de microfibra elastizada, surtido en caja.',
      sizes: ['M', 'L', 'XL', 'XXL'], colors: ['Negro', 'Petróleo', 'Grafito', 'Bordo'],
      presentation: 'Pack x 12 Unid.', saleType: 'Pack x 12 surtido en caja', tag: 'Línea Seamless',
      priceUnit: 5400, pricePack: 64800, isNew: false, inStock: true,
      images: ['/img/boxer-xy-underwear-pack.webp'],
    },
    {
      id: 'art-brillite-br204', brand: 'Brillite', code: 'BR-204',
      title: 'Bata Kimono Satén con Manga Puntilla Guipur',
      description: 'Bata kimono de satén con mangas de puntilla guipur.',
      sizes: ['1(S/M)', '2(L/XL)'], colors: ['Bordeaux', 'Marfil', 'Rosa Pastel', 'Negro'],
      presentation: 'Pack x 4 Unid.', saleType: 'Curva x 4 unidades', tag: 'Satén Premium',
      priceUnit: 17500, pricePack: 70000, isNew: false, inStock: true,
      images: ['/img/camisolin-natubel-saten.webp'],
    },
  ];
  // Fechas escalonadas para que el orden por "más reciente" respete el diseño.
  return base.map((a, i) => ({ ...a, createdAt: daysAgo(now, i + 1), updatedAt: daysAgo(now, i + 1) }));
}

export function seedBrands(now = Date.now()) {
  const base = [
    ['Brillite', 'BR', 'Corsetería Fina'],
    ['Kaury', 'KY', 'Lencería Juvenil'],
    ['Lody', 'LD', 'Diseño & Microfibra'],
    ['G3', 'G3', 'Underwear Cotidiano'],
    ['Acróbata', 'AC', 'Línea Masculina'],
    ['Belén', 'BL', 'Maternal & Curvas'],
    ['XY Underwear', 'XY', 'Boxers & Mediería'],
    ['Natubel', 'NT', 'Bikinis & Algodón'],
    ['Lara Teens', 'LT', 'Línea Teens'],
  ];
  return base.map(([name, initials, category], i) => ({
    id: 'brand-' + initials.toLowerCase(),
    name, initials, category, logo: '',
    createdAt: daysAgo(now, 30 - i),
  }));
}

export function seedBanners(now = Date.now()) {
  return [
    {
      id: 'banner-hero', type: 'hero', label: 'Portada Inicio #1',
      title: 'Colección Nueva Temporada Rosario',
      description: 'Imagen principal del inicio de la tienda mayorista.',
      alt: 'Colección lencería satén y encaje por bulto y curva mayorista Única Lencería',
      format: 'Se muestra vertical 4:5 (recomendado 1200×1500 px)',
      image: '/img/hero-coleccion-saten-encaje.webp', active: true, updatedAt: daysAgo(now, 2),
    },
    {
      id: 'banner-promo', type: 'promo', label: 'Banner Promocional',
      title: 'Curvas & Packs por Mayorista x12',
      description: 'Banner intermedio en sección marcas líderes con descuento escalonado.',
      alt: 'Banner curvas y packs mayoristas',
      format: 'Formato: 1200x400px',
      image: '/img/banner-curvas-packs-mayorista.webp', active: true, updatedAt: daysAgo(now, 7),
    },
    {
      id: 'banner-categoria', type: 'category', label: 'Portada Categoría',
      title: 'Especial Corsetería & Encaje',
      description: 'Encabezado de categoría Brillite y lencería fina para revendedoras.',
      alt: 'Banner corsetería y encaje',
      format: 'Formato: 1400x500px',
      image: '/img/banner-corseteria-encaje.webp', active: true, updatedAt: daysAgo(now, 21),
    },
  ];
}
