// Tema automático: a partir del color elegido en Configuración se calculan
// fondo, tarjetas, letras, bordes y botones, siempre con buen contraste.
const h2r = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const r2h = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = (h) => {
  const [r, g, b] = h2r(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Ajusta el color de acento hasta que se lea bien sobre el fondo dado
function acentoLegible(col, bg, toward, min) {
  let c = col;
  for (let i = 1; i <= 20 && contrast(c, bg) < min; i++) c = mix(col, toward, i * 0.05);
  return c;
}

const VARS = ['--accent', '--accent-soft', '--accent-ink', '--bg', '--card', '--ink', '--muted', '--line', '--shadow'];

export function aplicarTema(col) {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!col || !/^#[0-9a-f]{6}$/i.test(col)) {
    VARS.forEach((v) => root.style.removeProperty(v));
    root.style.removeProperty('color-scheme');
    return;
  }
  const oscuro = lum(col) < 0.08; // color muy oscuro -> app oscura; color claro/medio -> app clara
  let bg, card, line, ink, muted, accent, shadow;
  if (oscuro) {
    bg = mix(col, '#000000', 0.6);
    card = mix(bg, '#ffffff', 0.07);
    line = mix(bg, '#ffffff', 0.17);
    ink = '#f1f3fa';
    muted = mix(ink, bg, 0.38);
    accent = acentoLegible(col, bg, '#ffffff', 4.5);
    shadow = '0 1px 2px rgba(0,0,0,.4)';
  } else {
    bg = mix(col, '#ffffff', 0.93);
    card = '#ffffff';
    line = mix(col, '#ffffff', 0.82);
    ink = '#151826';
    muted = '#6b7285';
    accent = acentoLegible(col, card, '#000000', 4.5);
    shadow = '0 1px 2px rgba(16,24,40,.06),0 4px 16px rgba(16,24,40,.05)';
  }
  const accentInk = contrast(accent, '#ffffff') >= contrast(accent, '#0b0f1a') ? '#ffffff' : '#0b0f1a';
  const set = (k, v) => root.style.setProperty(k, v);
  set('--accent', accent);
  set('--accent-soft', `color-mix(in srgb, ${accent} 16%, transparent)`);
  set('--accent-ink', accentInk);
  set('--bg', bg); set('--card', card); set('--ink', ink); set('--muted', muted); set('--line', line); set('--shadow', shadow);
  set('color-scheme', oscuro ? 'dark' : 'light');
  if (meta) meta.setAttribute('content', bg);
}
