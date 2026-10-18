// ÚNICO punto de contacto con el servidor. Habla con uno de dos motores, sin que el resto de la app lo note:
//   · Google Apps Script (cada negocio con su propio Google Sheet)
//   · Supabase (varios negocios en una base de datos, con registro propio y prueba gratis)
// Se usa Supabase cuando hay SUPABASE_URL + SUPABASE_KEY (config.json, variables VITE_* o lo guardado en el login).
const DEFAULT_URL = import.meta.env.VITE_API_URL || '';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
};

// La URL puede venir de (1) lo guardado en el login, (2) public/config.json, (3) la variable VITE_API_URL
let fileUrl = '';
let fileSb = { url: '', key: '', negocio: '' };
export async function loadConfig() {
  // La APK "en vivo" abre la web con ?api=<URL del negocio>. Solo se acepta dentro de la app nativa
  // (así un link malicioso en un navegador normal no puede cambiar a qué servidor se conecta el usuario).
  try {
    const cap = window.Capacitor;
    const sp = new URLSearchParams(window.location.search);
    const nativa = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
    const q = sp.get('api'), sbu = sp.get('sb'), sbk = sp.get('sbk');
    if (nativa && sbu && sbk && /^https:\/\//i.test(sbu)) { store.set('sb_url', sbu.trim().replace(/\/+$/, '')); store.set('sb_key', sbk.trim()); store.set('api_url', null); }
    else if (nativa && q && /^https:\/\//i.test(q)) { store.set('api_url', q.trim()); store.set('sb_url', null); store.set('sb_key', null); }
  } catch { /* ignorar */ }
  try {
    const r = await fetch('./config.json', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      fileUrl = String(j.API_URL || '').trim();
      fileSb = { url: String(j.SUPABASE_URL || '').trim().replace(/\/+$/, ''), key: String(j.SUPABASE_KEY || '').trim(), negocio: String(j.NEGOCIO || '').trim().toLowerCase() };
    }
  } catch { /* sin config.json: se usa lo demás */ }
}
const envSb = { url: String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, ''), key: String(import.meta.env.VITE_SUPABASE_KEY || ''), negocio: String(import.meta.env.VITE_NEGOCIO || '').toLowerCase() };
// Orden: 1) Supabase elegido en este dispositivo, 2) si el sitio ya trae una URL de Apps Script se usa esa (los negocios de Sheets no cambian),
// 3) Supabase configurado en el sitio (config.json / variables VITE_*).
export function getSupabase() {
  const su = (store.get('sb_url') || '').replace(/\/+$/, ''), sk = store.get('sb_key') || '';
  if (su && sk) return { url: su, key: sk };
  if (store.get('api_url') || fileUrl || DEFAULT_URL) return null;
  const url = (fileSb.url || envSb.url || '').replace(/\/+$/, ''), key = fileSb.key || envSb.key || '';
  return url && key ? { url, key } : null;
}
// Las claves nuevas (sb_publishable_…) van solo en "apikey"; las antiguas (JWT "anon") también como Bearer
const sbHeaders = (sb, extra) => ({ apikey: sb.key, ...(sb.key.startsWith('eyJ') ? { Authorization: 'Bearer ' + sb.key } : {}), ...extra });
export const esSupabase = () => !!getSupabase();
export const setSupabase = (url, key) => { store.set('sb_url', url ? url.trim() : null); store.set('sb_key', key ? key.trim() : null); };
// Código del negocio (para mostrar su logo y nombre en el login). Viene de ?n=codigo, de lo guardado o de config.json
export const getNegocio = () => {
  try { const q = new URLSearchParams(window.location.search).get('n'); if (q && /^[a-z0-9]{1,30}$/i.test(q)) store.set('negocio', q.toLowerCase()); } catch { /* ignorar */ }
  return store.get('negocio') || fileSb.negocio || envSb.negocio || '';
};
export const setNegocio = (c) => store.set('negocio', c ? String(c).toLowerCase() : null);
export const getApiUrl = () => store.get('api_url') || fileUrl || DEFAULT_URL;
export const setApiUrl = (u) => store.set('api_url', u ? u.trim() : null);
export const getToken = () => store.get('token');
export const setToken = (t) => store.set('token', t);

export async function call(accion, datos = {}) {
  const sb = getSupabase();
  const url = sb ? sb.url + '/rest/v1/rpc/api' : getApiUrl();
  if (!url) throw new Error('Falta configurar la URL del servidor.');
  if (sb && accion === 'publico') datos = { negocio: getNegocio(), ...datos };
  let res;
  try {
    if (sb) res = await fetch(url, { method: 'POST', headers: sbHeaders(sb, { 'Content-Type': 'application/json' }), body: JSON.stringify({ accion, datos, token: getToken() }) });
    // Apps Script: sin cabeceras personalizadas, para evitar el "preflight" de CORS que no soporta.
    else res = await fetch(url, { method: 'POST', body: JSON.stringify({ accion, datos, token: getToken() }) });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu internet o la URL configurada.');
  }
  let json;
  try { json = await res.json(); } catch { throw new Error('Respuesta inválida del servidor. Revisa la URL configurada.'); }
  if (sb && json && json.ok === undefined) throw new Error(json.message || 'Error del servidor (revisa la URL y la clave de Supabase).');
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
  const sb = getSupabase();
  if (!sb) return call('subirArchivo', { modulo, ...f });
  // Supabase: primero se reserva un lugar (se valida sesión y permisos) y luego se sube el archivo al almacenamiento
  const bin = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  const r = await call('subirArchivo', { modulo, mime: f.mime, nombre: f.nombre, tamano: bin.length });
  let res;
  try { res = await fetch(`${sb.url}/storage/v1/object/${r.bucket}/${r.path}`, { method: 'POST', headers: sbHeaders(sb, { 'Content-Type': f.mime, 'x-upsert': 'false' }), body: bin }); }
  catch { throw new Error('No se pudo subir el archivo. Revisa tu conexión.'); }
  if (!res.ok) throw new Error('No se pudo subir el archivo (' + res.status + ').');
  return { id: r.id, url: sb.url + r.url };
}
