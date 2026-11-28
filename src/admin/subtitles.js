// Redes → Subtítulos automáticos: se sube un video ya recortado, la IA escucha lo que se dice
// y le pone subtítulos (palabra por palabra, la que se está diciendo resaltada). El estilo se elige
// (letra, colores, fondo, posición) y se pueden corregir las palabras. Además detecta los cortes
// del video y les pone un zoom suave. Todo se procesa en el navegador: el video no se sube a ningún lado.
import { esc } from '../shared/utils.js';
import { copyText, download, roundRect } from './social.js';

const $ = (sel, root = document) => root.querySelector(sel);
const STYLE_KEY = 'unica_subtitulos_estilo';
const MAX_SECONDS = 180;

const FONTS = {
  montserrat: { label: 'Montserrat (tipo TikTok)', css: '900 {s}px "Montserrat", sans-serif' },
  anton: { label: 'Anton (impacto)', css: '400 {s}px "Anton", sans-serif' },
  jakarta: { label: 'Jakarta (moderna)', css: '800 {s}px "Plus Jakarta Sans", sans-serif' },
  playfair: { label: 'Playfair (elegante)', css: '700 {s}px "Playfair Display", serif' },
};

const DEFAULT_STYLE = {
  font: 'montserrat',
  size: 'm',
  color: '#ffffff',
  highlight: '#f9a8d4',
  bg: 'borde', // ninguno | borde | caja
  bgColor: '#be185d',
  position: 'abajo',
  upper: true,
  words: 3,
  zoomCuts: true,
  logo: true,
};

let d; // { showToast }
const st = { file: null, url: '', words: [], groups: [], style: loadStyle(), duration: 0, w: 0, h: 0, busy: false, video: null, preview: 0 };
let worker = null;
let logoImg = null;

function loadStyle() {
  try {
    return { ...DEFAULT_STYLE, ...JSON.parse(localStorage.getItem(STYLE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}
function saveStyle() {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(st.style));
  } catch {
    /* sin almacenamiento */
  }
}

/* ---------------------------------------------------------------- Audio → texto */

/**
 * En el iPhone el navegador no deja reproducir con sonido si no es en el mismo toque del botón.
 * Por eso, apenas se toca, se crea el audio y se "destraba" un video que después se usa.
 */
function unlockMedia() {
  const ac = new AudioContext();
  ac.resume();
  const video = document.createElement('video');
  video.src = st.url;
  video.playsInline = true;
  video.preload = 'auto';
  const ready = video
    .play()
    .then(() => {
      video.pause();
      video.currentTime = 0;
    })
    .catch(() => {});
  return { ac, video, ready };
}

/** Espera a que el video tenga datos para reproducir (o avisa si no carga). */
function whenReady(video) {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => (video.readyState >= 2 ? resolve() : reject(new Error('El video tarda en cargar. Probá de nuevo.'))), 15000);
    video.addEventListener('loadeddata', done, { once: true });
    video.addEventListener('canplay', done, { once: true });
    video.onerror = () => reject(new Error('No se pudo abrir el video.'));
    if (video.networkState === 0) video.load();
  });
}

async function toMono16k(buf) {
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Plan B: reproduce el video en silencio y va guardando el sonido (tarda lo que dura el video). */
async function captureAudio({ ac, video, ready }, onProgress) {
  await ready;
  await whenReady(video);
  const source = ac.createMediaElementSource(video);
  const proc = ac.createScriptProcessor(4096, 1, 1);
  const mute = ac.createGain();
  mute.gain.value = 0;
  const parts = [];
  proc.onaudioprocess = (e) => {
    if (!video.paused) parts.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(proc);
  proc.connect(mute).connect(ac.destination);
  video.currentTime = 0;
  await video.play();
  await new Promise((resolve) => {
    const timer = setInterval(() => onProgress(video.currentTime / (video.duration || 1)), 300);
    video.onended = () => {
      clearInterval(timer);
      resolve();
    };
  });
  source.disconnect();
  proc.disconnect();
  const total = parts.reduce((n, x) => n + x.length, 0);
  if (!total) throw new Error('No se pudo leer el audio del video.');
  const buf = ac.createBuffer(1, total, ac.sampleRate);
  const data = buf.getChannelData(0);
  let off = 0;
  for (const x of parts) {
    data.set(x, off);
    off += x.length;
  }
  return toMono16k(buf);
}

/** Saca el audio del video en mono a 16 kHz, que es lo que necesita la IA. */
async function audioOf(file, media, onStatus) {
  try {
    const buf = await media.ac.decodeAudioData(await file.arrayBuffer());
    return await toMono16k(buf);
  } catch {
    onStatus('Leyendo el audio del video… (tarda lo que dura el video)');
    return captureAudio(media, (p) => onStatus(`Leyendo el audio del video… ${Math.round(p * 100)}%`));
  }
}

function transcribe(audio, onStatus) {
  worker ??= new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'download') onStatus(`Preparando la IA (solo la primera vez, ~${m.mb} MB)… ${Math.round(m.progress * 100)}%`);
      if (m.type === 'listening') onStatus('Escuchando el video… (puede tardar un poco)');
      if (m.type === 'done') resolve(m.words);
      if (m.type === 'error') reject(new Error(`No se pudieron generar los subtítulos: ${m.message}`));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Error de la IA.'));
    worker.postMessage({ audio }, [audio.buffer]);
  });
}

/** Junta las palabras de a N en subtítulos; corta antes si hay una pausa o un punto. */
function groupWords(words, n) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    if (!w.text) continue;
    const prev = cur[cur.length - 1];
    if (cur.length && (cur.length >= n || w.start - prev.end > 0.6 || /[.!?]$/.test(prev.text))) {
      groups.push(cur);
      cur = [];
    }
    cur.push({ ...w });
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => ({ start: g[0].start, end: g[g.length - 1].end, words: g }));
}

/** Si se corrige el texto de un subtítulo, las palabras nuevas se reparten en su mismo tiempo. */
function retext(group, value) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const span = Math.max(0.1, group.end - group.start);
  group.words = parts.map((text, i) => ({ text, start: group.start + (span * i) / parts.length, end: group.start + (span * (i + 1)) / parts.length }));
}

/* ---------------------------------------------------------------- Dibujo */

function fontCss(size) {
  return FONTS[st.style.font].css.replace('{s}', Math.round(size));
}

function drawCaption(ctx, W, H, t) {
  const g = st.groups.find((x) => t >= x.start - 0.05 && t <= x.end + 0.15);
  if (!g || !g.words.length) return;
  const s = st.style;
  const size = (Math.min(W, H) / 1080) * { s: 54, m: 70, l: 90 }[s.size];
  ctx.save();
  ctx.font = fontCss(size);
  ctx.textBaseline = 'middle';
  const words = g.words.map((w) => ({ ...w, label: s.upper ? w.text.toUpperCase() : w.text }));
  const space = ctx.measureText(' ').width;
  const maxW = W * 0.86;
  // Armado de renglones
  const rows = [[]];
  let rowW = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.label).width;
    if (rows[rows.length - 1].length && rowW + space + ww > maxW) {
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1].push({ ...w, w: ww });
    rowW += (rowW ? space : 0) + ww;
  }
  const lh = size * 1.25;
  const blockH = rows.length * lh;
  const cy = s.position === 'arriba' ? H * 0.2 : s.position === 'centro' ? H * 0.5 : H * 0.76;
  let y = cy - blockH / 2 + lh / 2;
  // Aparece con un pequeño "pop"
  const pop = Math.min(1, (t - g.start) / 0.12);
  const scale = 0.9 + 0.1 * Math.max(0, pop);
  ctx.translate(W / 2, cy);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -cy);
  for (const row of rows) {
    const total = row.reduce((a, w) => a + w.w, 0) + space * (row.length - 1);
    let x = (W - total) / 2;
    if (s.bg === 'caja') {
      ctx.fillStyle = s.bgColor;
      roundRect(ctx, x - size * 0.35, y - lh / 2, total + size * 0.7, lh, size * 0.3);
      ctx.fill();
    }
    for (const w of row) {
      const on = t >= w.start && t < w.end + 0.05;
      ctx.save();
      if (on) {
        ctx.translate(x + w.w / 2, y);
        ctx.scale(1.08, 1.08);
        ctx.translate(-(x + w.w / 2), -y);
      }
      if (s.bg === 'borde') {
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = '#000';
        ctx.strokeText(w.label, x, y);
      } else if (s.bg === 'ninguno') {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = size * 0.25;
      }
      ctx.fillStyle = on ? s.highlight : s.color;
      ctx.fillText(w.label, x, y);
      ctx.restore();
      x += w.w + space;
    }
    y += lh;
  }
  ctx.restore();
}

/** Dibuja un cuadro: video (con zoom suave en los cortes), subtítulo y logo. */
function makeFrameDrawer(ctx, W, H) {
  const tiny = document.createElement('canvas');
  tiny.width = 32;
  tiny.height = 18;
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  let prev = null;
  let cutAt = -10;
  return (video) => {
    const t = video.currentTime;
    // Detección de cortes: compara el cuadro con el anterior en miniatura
    if (st.style.zoomCuts) {
      tctx.drawImage(video, 0, 0, 32, 18);
      const data = tctx.getImageData(0, 0, 32, 18).data;
      if (prev) {
        let diff = 0;
        for (let i = 0; i < data.length; i += 4) diff += Math.abs(data[i] - prev[i]) + Math.abs(data[i + 1] - prev[i + 1]) + Math.abs(data[i + 2] - prev[i + 2]);
        if (diff / (data.length / 4) / 3 > 38 && t - cutAt > 0.5) cutAt = t;
      }
      prev = data;
    }
    const k = Math.max(0, Math.min(1, (t - cutAt) / 0.4));
    const zoom = st.style.zoomCuts ? 1 + 0.07 * (1 - (1 - Math.pow(1 - k, 3))) : 1;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.drawImage(video, -W / 2, -H / 2, W, H);
    ctx.restore();
    drawCaption(ctx, W, H, t);
    if (st.style.logo && logoImg) {
      const size = Math.min(W, H) * 0.11;
      const x = W - size - Math.min(W, H) * 0.04;
      const y = Math.min(W, H) * 0.04;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, x, y, size, size);
      ctx.restore();
    }
  };
}

/* ---------------------------------------------------------------- Vista previa y exportación */

function outSize() {
  const k = Math.min(1, 1920 / Math.max(st.w, st.h));
  return [Math.round((st.w * k) / 2) * 2, Math.round((st.h * k) / 2) * 2];
}

function startPreview() {
  const canvas = $('#subsPreview');
  const video = st.video;
  if (!canvas || !video) return;
  const [W, H] = outSize();
  canvas.width = Math.round(W / 2);
  canvas.height = Math.round(H / 2);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
  const draw = makeFrameDrawer(ctx, W, H);
  cancelAnimationFrame(st.preview);
  const loop = () => {
    if (video.readyState >= 2) draw(video);
    st.preview = requestAnimationFrame(loop);
  };
  loop();
}

const MIME = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];

/** Reproduce el video de punta a punta dibujando cada cuadro con subtítulos y lo graba (tarda lo que dura el video). */
async function exportVideo(onProgress, media) {
  const mime = window.MediaRecorder && MIME.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Este navegador no puede grabar video. Probá desde Chrome o desde el celular.');
  const { video, ac, ready } = media;
  await ready;
  await whenReady(video);
  video.currentTime = 0;
  const [W, H] = outSize();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const draw = makeFrameDrawer(ctx, W, H);
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  ac.createMediaElementSource(video).connect(dest);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  draw(video);
  rec.start(500);
  await video.play();
  await new Promise((resolve) => {
    const tick = () => {
      draw(video);
      onProgress(Math.min(1, video.currentTime / st.duration));
      if (video.ended) return resolve();
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(tick);
      else requestAnimationFrame(tick);
    };
    tick();
    video.onended = () => setTimeout(resolve, 200);
  });
  rec.stop();
  await stopped;
  ac.close();
  const type = mime.split(';')[0];
  return new File([new Blob(chunks, { type })], `video-subtitulado.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type });
}

/* ---------------------------------------------------------------- Pantalla */

const btn = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold';
const sel = 'bg-surface-container-low px-3 py-2 pr-8 rounded-xl text-sm border-none focus:ring-2 focus:ring-primary font-medium';
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function styleControls() {
  const s = st.style;
  const opt = (pairs, v) => pairs.map(([k, t]) => `<option value="${k}"${k === String(v) ? ' selected' : ''}>${t}</option>`).join('');
  return `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-semibold">
    <label class="flex flex-col gap-1">Letra<select data-style="font" class="${sel}">${opt(Object.entries(FONTS).map(([k, f]) => [k, f.label]), s.font)}</select></label>
    <label class="flex flex-col gap-1">Tamaño<select data-style="size" class="${sel}">${opt([['s', 'Chico'], ['m', 'Mediano'], ['l', 'Grande']], s.size)}</select></label>
    <label class="flex flex-col gap-1">Posición<select data-style="position" class="${sel}">${opt([['abajo', 'Abajo'], ['centro', 'Centro'], ['arriba', 'Arriba']], s.position)}</select></label>
    <label class="flex flex-col gap-1">Palabras por subtítulo<select data-style="words" class="${sel}">${opt([['1', '1 (palabra por palabra)'], ['2', '2'], ['3', '3'], ['4', '4'], ['6', '6']], s.words)}</select></label>
    <label class="flex flex-col gap-1">Fondo<select data-style="bg" class="${sel}">${opt([['borde', 'Borde negro'], ['caja', 'Caja de color'], ['ninguno', 'Solo sombra']], s.bg)}</select></label>
    <label class="flex flex-col gap-1">Color de la caja<input type="color" data-style="bgColor" value="${s.bgColor}" class="h-10 w-full rounded-xl"></label>
    <label class="flex flex-col gap-1">Color de la letra<input type="color" data-style="color" value="${s.color}" class="h-10 w-full rounded-xl"></label>
    <label class="flex flex-col gap-1">Palabra que se dice<input type="color" data-style="highlight" value="${s.highlight}" class="h-10 w-full rounded-xl"></label>
    <div class="flex flex-col gap-2 justify-end">
      <label class="flex items-center gap-2"><input type="checkbox" data-style="upper"${s.upper ? ' checked' : ''} class="rounded text-primary"> MAYÚSCULAS</label>
      <label class="flex items-center gap-2"><input type="checkbox" data-style="zoomCuts"${s.zoomCuts ? ' checked' : ''} class="rounded text-primary"> Zoom en los cortes</label>
      <label class="flex items-center gap-2"><input type="checkbox" data-style="logo"${s.logo ? ' checked' : ''} class="rounded text-primary"> Logo en la esquina</label>
    </div>
  </div>`;
}

function captionList() {
  if (!st.groups.length) return '<p class="text-sm text-on-surface-variant">No se escuchó ninguna palabra en el video.</p>';
  return `<div class="max-h-72 overflow-y-auto flex flex-col gap-1.5 pr-1">${st.groups
    .map(
      (g, i) => `<label class="flex items-center gap-2 text-xs"><span class="w-10 shrink-0 text-on-surface-variant tabular-nums">${fmt(g.start)}</span>
      <input data-group="${i}" value="${esc(g.words.map((w) => w.text).join(' '))}" class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface-container-lowest border-none text-sm focus:ring-2 focus:ring-primary"></label>`
    )
    .join('')}</div>`;
}

export function renderSubtitles() {
  const box = $('#subsPanel');
  if (!box || !d) return;
  const ready = st.groups.length || st.words.length;
  box.innerHTML = `
  <p class="text-sm text-on-surface-variant">Subí el video ya recortado: la IA escucha lo que se dice y le pone subtítulos, con la palabra que se está diciendo resaltada. También le pone un zoom suave en cada corte. El video no se sube a ningún lado: se procesa en tu dispositivo.</p>
  <div class="mt-3 flex flex-wrap items-center gap-2">
    <label class="${btn} bg-primary text-on-primary cursor-pointer"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span><span>${st.file ? 'Elegir otro video' : 'Subir video'}</span>
      <input type="file" id="subsFile" accept="video/*" class="hidden"></label>
    ${st.file ? `<span class="text-xs text-on-surface-variant">${esc(st.file.name)} · ${fmt(st.duration)}</span>` : ''}
    ${st.file && !ready ? `<button type="button" data-subs="go" class="${btn} bg-primary text-on-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">subtitles</span><span>Generar subtítulos</span></button>` : ''}
  </div>
  <p id="subsStatus" class="mt-2 text-sm font-semibold text-primary" role="status"></p>
  ${
    st.file
      ? `<div class="mt-4 grid gap-5 lg:grid-cols-[auto,1fr]">
      <div class="flex flex-col items-start gap-2">
        <canvas id="subsPreview" class="max-h-[28rem] max-w-full rounded-xl bg-black shadow-sm"></canvas>
        <div class="flex gap-2"><button type="button" data-subs="play" class="${btn} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">play_circle</span><span>Reproducir</span></button>
        <button type="button" data-subs="pause" class="${btn} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">pause_circle</span><span>Pausa</span></button></div>
      </div>
      <div class="flex flex-col gap-4 min-w-0">
        ${styleControls()}
        ${ready ? `<div><p class="text-xs font-bold text-on-surface-variant mb-1">Subtítulos (corregí la palabra que quieras)</p>${captionList()}</div>` : ''}
        ${
          ready
            ? `<div class="flex flex-wrap gap-2">
          <button type="button" data-subs="share" class="${btn} bg-primary text-on-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">ios_share</span><span>Compartir en Instagram</span></button>
          <button type="button" data-subs="download" class="${btn} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">download</span><span>Descargar video</span></button>
          <button type="button" data-subs="copy" class="${btn} bg-surface-container-high"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span><span>Copiar texto dicho</span></button>
        </div>
        <p class="text-[11px] text-on-surface-variant">Al descargar, el video se graba con los subtítulos: tarda lo mismo que dura. No cambies de pantalla mientras graba.</p>`
            : ''
        }
      </div>
    </div>`
      : ''
  }`;
  if (st.file) startPreview();
}

const status = (msg) => {
  const el = $('#subsStatus');
  if (el) el.textContent = msg;
};

async function pickFile(file) {
  if (!file.type.startsWith('video/')) return d.showToast('Elegí un archivo de video.', 'error');
  if (file.size > 400 * 1024 * 1024) return d.showToast('El video pesa más de 400 MB: probá con uno más corto.', 'error');
  if (st.url) URL.revokeObjectURL(st.url);
  st.file = file;
  st.url = URL.createObjectURL(file);
  st.words = [];
  st.groups = [];
  st.result = null;
  const video = document.createElement('video');
  video.src = st.url;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise((r, j) => {
    video.onloadedmetadata = r;
    video.onerror = () => j(new Error('No se pudo abrir el video.'));
  }).catch((err) => d.showToast(err.message, 'error'));
  st.duration = video.duration || 0;
  st.w = video.videoWidth || 1080;
  st.h = video.videoHeight || 1920;
  if (st.duration > MAX_SECONDS) {
    d.showToast(`El video dura más de ${MAX_SECONDS / 60} minutos: recortalo antes de subirlo.`, 'error');
    st.file = null;
    return renderSubtitles();
  }
  st.video = video;
  video.currentTime = 0.01;
  renderSubtitles();
}

async function generate(button) {
  if (st.busy) return;
  const media = unlockMedia(); // tiene que ser en el mismo toque (iPhone)
  st.busy = true;
  button.disabled = true;
  try {
    status('Sacando el audio del video…');
    const audio = await audioOf(st.file, media, status);
    st.words = await transcribe(audio, status);
    st.groups = groupWords(st.words, Number(st.style.words));
    status(st.groups.length ? `Listo: ${st.groups.length} subtítulos. Revisalos y corregí lo que haga falta.` : 'No se escuchó ninguna palabra.');
    renderSubtitles();
    status(st.groups.length ? `Listo: ${st.groups.length} subtítulos. Revisalos y corregí lo que haga falta.` : 'No se escuchó ninguna palabra.');
  } catch (err) {
    status('');
    d.showToast(err.message, 'error');
  } finally {
    if (media.ac.state !== 'closed') media.ac.close().catch(() => {});
    st.busy = false;
    button.disabled = false;
  }
}

async function deliver(button, action) {
  if (st.busy) return;
  const media = st.result ? null : unlockMedia(); // en el mismo toque (iPhone)
  st.busy = true;
  const label = button.lastElementChild;
  const original = label.textContent;
  button.disabled = true;
  st.video?.pause();
  try {
    if (!st.result) st.result = await exportVideo((p) => (label.textContent = `Grabando… ${Math.round(p * 100)}%`), media);
    if (action === 'share' && navigator.canShare?.({ files: [st.result] })) {
      try {
        await navigator.share({ files: [st.result] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    download(st.result, st.result.name);
    d.showToast('Video descargado con subtítulos.');
  } catch (err) {
    d.showToast(err.message || 'No se pudo grabar el video.', 'error');
  } finally {
    label.textContent = original;
    button.disabled = false;
    st.busy = false;
  }
}

export function initSubtitles(deps) {
  d = deps;
  const img = new Image();
  img.onload = () => (logoImg = img);
  img.src = '/img/logo-unica.webp';
  const panel = $('#subsPanel');
  panel.addEventListener('change', (e) => {
    if (e.target.id === 'subsFile' && e.target.files[0]) return pickFile(e.target.files[0]);
    const key = e.target.dataset.style;
    if (key) {
      st.style[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      saveStyle();
      st.result = null;
      if (key === 'words' && st.words.length) {
        st.groups = groupWords(st.groups.flatMap((g) => g.words), Number(st.style.words));
        renderSubtitles();
      }
      return;
    }
    const gi = e.target.dataset.group;
    if (gi != null) {
      retext(st.groups[Number(gi)], e.target.value);
      st.result = null;
    }
  });
  panel.addEventListener('input', (e) => {
    if (e.target.type === 'color' && e.target.dataset.style) {
      st.style[e.target.dataset.style] = e.target.value;
      st.result = null;
    }
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-subs]');
    if (!b) return;
    const a = b.dataset.subs;
    if (a === 'go') generate(b);
    if (a === 'play') st.video?.play();
    if (a === 'pause') st.video?.pause();
    if (a === 'share' || a === 'download') deliver(b, a);
    if (a === 'copy') copyText(st.groups.map((g) => g.words.map((w) => w.text).join(' ')).join(' ')).then((ok) => d.showToast(ok ? 'Texto copiado.' : 'No se pudo copiar.', ok ? 'ok' : 'error'));
  });
}
