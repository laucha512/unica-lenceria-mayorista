import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import * as cfg from './src/config.js';

// Reemplaza marcadores {{...}} en los HTML con los datos de src/config.js,
// así el HTML servido ya trae los valores reales (SEO / sin JS).
const tokens = {
  WA_NUMBER: cfg.WHATSAPP_NUMBER,
  WA_DISPLAY: cfg.WHATSAPP_DISPLAY,
  IG_USER: cfg.INSTAGRAM_USER,
  IG_URL: cfg.INSTAGRAM_URL,
  MIN_PURCHASE: cfg.MIN_PURCHASE_LABEL,
  MIN_PURCHASE_RAW: String(cfg.MIN_PURCHASE),
  SITE_URL: cfg.SITE_URL,
  YEAR: String(new Date().getFullYear()),
};

function configTokens() {
  return {
    name: 'config-tokens',
    transformIndexHtml(html) {
      return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
        if (!(key in tokens)) throw new Error(`Marcador desconocido en HTML: ${m}`);
        return tokens[key];
      });
    },
  };
}

export default defineConfig({
  plugins: [configTokens()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
