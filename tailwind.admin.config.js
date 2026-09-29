// Config de Tailwind del PANEL ADMIN (admin/index.html). Tomada del tailwind.config inline de Stitch.
// Nota: en el admin "primary" es #970046 y "primary-container" #be185d (al revés que en la tienda).
import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

const sans = ['Plus Jakarta Sans', 'system-ui', 'sans-serif'];
const serif = ['Playfair Display', 'Georgia', 'serif'];

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./admin/index.html', './src/admin/**/*.js', './src/shared/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'inverse-surface': '#27313f',
        tertiary: '#735c00',
        'surface-dim': '#d0dbed',
        'on-secondary-container': '#6e5e68',
        'surface-container': '#e6eeff',
        'surface-container-high': '#dee9fc',
        'on-tertiary': '#ffffff',
        'secondary-container': '#efdae6',
        'on-surface': '#121c2a',
        'inverse-on-surface': '#eaf1ff',
        'error-container': '#ffdad6',
        'tertiary-fixed-dim': '#e9c349',
        'secondary-fixed-dim': '#d5c1cd',
        'surface-container-low': '#eff4ff',
        'on-background': '#121c2a',
        'surface-container-highest': '#d9e3f6',
        'tertiary-fixed': '#ffe088',
        'outline-variant': '#e0bec4',
        secondary: '#695a64',
        'on-tertiary-container': '#4e3d00',
        'on-primary': '#ffffff',
        'on-primary-fixed-variant': '#8f0042',
        'on-surface-variant': '#594046',
        'on-tertiary-fixed-variant': '#574500',
        surface: '#f8f9ff',
        'tertiary-container': '#cba72f',
        'primary-container': '#be185d',
        'inverse-primary': '#ffb1c3',
        error: '#ba1a1a',
        'on-secondary': '#ffffff',
        'primary-fixed-dim': '#ffb1c3',
        'surface-bright': '#f8f9ff',
        background: '#f8f9ff',
        'on-secondary-fixed': '#231820',
        'secondary-fixed': '#f1dde9',
        'on-tertiary-fixed': '#241a00',
        'surface-container-lowest': '#ffffff',
        'on-secondary-fixed-variant': '#51434c',
        'on-primary-container': '#ffd5dd',
        'surface-variant': '#d9e3f6',
        'on-primary-fixed': '#3f0019',
        primary: '#970046',
        outline: '#8d7075',
        'on-error-container': '#93000a',
        'primary-fixed': '#ffd9e0',
        'surface-tint': '#b81059',
        'on-error': '#ffffff',
      },
      fontFamily: {
        'label-sm': sans,
        'headline-xl': serif,
        'label-lg': sans,
        'title-md': sans,
        'body-sm': sans,
        'body-md': sans,
        'body-lg': sans,
        'headline-lg': serif,
        'headline-sm': serif,
      },
    },
  },
  plugins: [forms, containerQueries],
};
