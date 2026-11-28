// Transcribe el audio de un video con Whisper (IA de reconocimiento de voz) dentro del navegador:
// el video no sale de la computadora/celular. El modelo se baja una sola vez y queda guardado.
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = '/admin/ort/'; // archivos del motor servidos por la propia web

const MODEL = 'onnx-community/whisper-base_timestamped';
let asr = null;

async function load() {
  if (asr) return asr;
  // Modo compatible (WASM): anda en cualquier navegador y da resultados estables. La placa de video
  // (WebGPU) con modelos comprimidos a veces devuelve texto roto, por eso no se usa.
  const device = 'wasm';
  const files = new Map();
  asr = await pipeline('automatic-speech-recognition', MODEL, {
    device,
    dtype: 'q8',
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files.set(p.file, [p.loaded, p.total]);
      let loaded = 0;
      let total = 0;
      for (const [l, t] of files.values()) {
        loaded += l;
        total += t;
      }
      self.postMessage({ type: 'download', progress: loaded / total, mb: Math.round(total / 1048576) });
    },
  });
  return asr;
}

self.onmessage = async (e) => {
  try {
    const model = await load();
    self.postMessage({ type: 'listening' });
    const out = await model(e.data.audio, {
      language: 'spanish',
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    self.postMessage({ type: 'done', words: (out.chunks || []).map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 })) });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
