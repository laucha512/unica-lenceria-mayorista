// Muestras de color para los chips de colores (tienda y admin).
export const COLOR_SWATCHES = {
  Blanco: '#ffffff',
  Negro: '#000000',
  Nude: '#E8C5A8',
  'Rosa Pastel': '#F7C6D0',
  Borravino: '#5E1224',
  'Azul Marino': '#1B264F',
  Piel: '#E0B89A',
  'Visón': '#8A7866',
  Gris: '#9CA3AF',
  'Gris Melange': '#A3A3A3',
  Champagne: '#F1DDB5',
  'Rosa Viejo': '#C08081',
  Bordo: '#6D071A',
  Bordeaux: '#6D071A',
  Marfil: '#F4EFE1',
  Rosa: '#F9A8D4',
  Celeste: '#A5D8F3',
  Hueso: '#EFE6D8',
  'Rojo Rubí': '#9B111E',
  'Petróleo': '#1D4E5F',
  Grafito: '#41424C',
  Melange: '#B8B8B8',
};

/** Color de la muestra o null si no se conoce (se dibuja un círculo neutro). */
export const swatchOf = (name) => {
  const key = Object.keys(COLOR_SWATCHES).find((k) => k.toLowerCase() === String(name).trim().toLowerCase());
  return key ? COLOR_SWATCHES[key] : null;
};
