// ÚNICO punto de contacto con el servidor. Si algún día migras a otro backend
// (Supabase, un servidor propio...), solo se cambia este archivo.
const DEFAULT_URL = import.meta.env.VITE_API_URL || '';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
};

// La URL puede venir de (1) lo guardado en el login, (2) public/config.json, (3) la variable VITE_API_URL
let fileUrl = '';
export async function loadConfig() {
  try {
    const r = await fetch('./config.json', { cache: 'no-store' });
    if (r.ok) fileUrl = String((await r.json()).API_URL || '').trim();
  } catch { /* sin config.json: se usa lo demás */ }
}
export const getApiUrl = () => store.get('api_url') || fileUrl || DEFAULT_URL;
export const setApiUrl = (u) => store.set('api_url', u ? u.trim() : null);
export const getToken = () => store.get('token');
export const setToken = (t) => store.set('token', t);

export async function call(accion, datos = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('Falta configurar la URL del servidor (Apps Script).');
  let res;
  try {
    // Sin cabeceras personalizadas: evita el "preflight" de CORS que Apps Script no soporta.
    res = await fetch(url, { method: 'POST', body: JSON.stringify({ accion, datos, token: getToken() }) });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet o la URL configurada.');
  }
  let json;
  try { json = await res.json(); } catch { throw new Error('Respuesta inválida del servidor. Revisa la URL de la implementación.'); }
  if (!json.ok) {
    if (json.code === 'LICENSE') window.dispatchEvent(new CustomEvent('license-blocked', { detail: json.licencia }));
    if (json.code === 'AUTH') { setToken(null); window.dispatchEvent(new Event('auth-expired')); }
    throw new Error(json.error || 'Error desconocido');
  }
  return json.data;
}

export const listar = (tabla) => call('listar', { tabla });

// Reduce la imagen en el navegador antes de subirla (ahorra datos y cuota)
export async function fileToBase64(file, maxSide = 900) {
  if (file.type === 'application/pdf') return readB64(file);
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  if (file.type === 'image/png') { /* conserva transparencia (logos) */ } else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const dataUrl = c.toDataURL(mime, 0.85);
  return { mime, base64: dataUrl.split(',')[1], nombre: file.name };
}
function readB64(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok({ mime: file.type, base64: String(r.result).split(',')[1], nombre: file.name });
    r.onerror = no; r.readAsDataURL(file);
  });
}
export async function subirArchivo(file, modulo) {
  const f = await fileToBase64(file);
  return call('subirArchivo', { modulo, ...f });
}
