// Copia los archivos del motor de IA (ONNX Runtime) a public/admin/ort/ para servirlos desde la web
// (la política de seguridad no permite cargarlos de otro sitio). Corre solo antes de cada build.
import { copyFileSync, mkdirSync } from 'node:fs';
const from = 'node_modules/@huggingface/transformers/dist/';
const to = 'public/admin/ort/';
mkdirSync(to, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) copyFileSync(from + f, to + f);
console.log('ONNX Runtime copiado a', to);
