// Tema automático: el color elegido en Configuración es el FONDO de la app.
// Letras, tarjetas, bordes, botones y colores de estado se calculan solos
// para que siempre se lean bien (claro sobre fondo oscuro, oscuro sobre claro).
const h2r = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const r2h = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = (h) => {
  const [r, g, b] = h2r(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Acerca un color hacia "toward" hasta que tenga contraste suficiente con "bg"
function legible(col, bg, toward, min = 4.5) {
  let c = col;
  for (let i = 1; i <= 20 && contrast(c, bg) < min; i++) c = mix(col, toward, i * 0.05);
  return c;
}

const VARS = ['--accent', '--accent-soft', '--accent-ink', '--bg', '--card', '--ink', '--muted', '--line', '--shadow', '--ok', '--warn', '--bad', '--ok-ink', '--bad-ink'];

export function aplicarTema(col) {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!col || !/^#[0-9a-f]{6}$/i.test(col)) {
    VARS.forEach((v) => root.style.removeProperty(v));
    root.style.removeProperty('color-scheme');
    return;
  }
  const bg = col;
  const ink = contrast('#ffffff', bg) >= contrast('#10131f', bg) ? '#f4f6fc' : '#10131f';
  const oscuro = ink === '#f4f6fc';
  const card = oscuro ? mix(bg, '#ffffff', 0.08) : mix(bg, '#ffffff', 0.55);
  const line = mix(bg, ink, 0.2);
  const muted = legible(mix(ink, bg, 0.4), card, ink, 4.5);
  // Botones/acentos: mismo tono que el fondo pero claro (si fondo oscuro) u oscuro (si fondo claro)
  const base = oscuro ? mix(bg, '#ffffff', 0.7) : mix(bg, '#000000', 0.6);
  const accent = legible(base, card, oscuro ? '#ffffff' : '#000000', 4.5);
  const accentInk = contrast(accent, '#ffffff') >= contrast(accent, '#0b0f1a') ? '#ffffff' : '#0b0f1a';
  // Colores de estado (verde / ámbar / rojo) legibles sobre la tarjeta
  const ok = legible(oscuro ? '#4ade80' : '#15803d', card, oscuro ? '#ffffff' : '#000000', 4.5);
  const warn = legible(oscuro ? '#fbbf24' : '#b45309', card, oscuro ? '#ffffff' : '#000000', 4.5);
  const bad = legible(oscuro ? '#f87171' : '#b91c1c', card, oscuro ? '#ffffff' : '#000000', 4.5);
  const inkOn = (c) => (contrast(c, '#ffffff') >= contrast(c, '#0b0f1a') ? '#ffffff' : '#0b0f1a');

  const set = (k, v) => root.style.setProperty(k, v);
  set('--bg', bg); set('--card', card); set('--ink', ink); set('--muted', muted); set('--line', line);
  set('--accent', accent); set('--accent-ink', accentInk);
  set('--accent-soft', `color-mix(in srgb, ${accent} 18%, transparent)`);
  set('--ok', ok); set('--warn', warn); set('--bad', bad);
  set('--ok-ink', inkOn(ok)); set('--bad-ink', inkOn(bad));
  set('--shadow', oscuro ? '0 1px 2px rgba(0,0,0,.4)' : '0 1px 2px rgba(16,24,40,.08),0 4px 16px rgba(16,24,40,.06)');
  set('color-scheme', oscuro ? 'dark' : 'light');
  if (meta) meta.setAttribute('content', bg);
}
