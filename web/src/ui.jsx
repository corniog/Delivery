import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './auth.jsx';
import { subirArchivo } from './api.js';

/* ---------- Iconos ---------- */
const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  tag: 'M20 12l-8 8-9-9V3h8l9 9zM7.5 7.5h.01',
  users: 'M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8zM22 20v-2a4 4 0 00-3-3.9M16 2.1a4 4 0 010 7.8',
  truck: 'M1 5h13v11H1zM14 9h4l4 4v3h-8M6 19a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z',
  store: 'M3 9l1-5h16l1 5M3 9v11h18V9M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M9 20v-6h6v6',
  clock: 'M12 7v5l3 2M12 22a10 10 0 100-20 10 10 0 000 20z',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  file: 'M14 3H6v18h12V7l-4-4zM14 3v4h4M9 13h6M9 17h6',
  book: 'M4 19V5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0a2 2 0 002 2h13M8 7h7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  plus: 'M12 5v14M5 12h14',
  scan: 'M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M7 12h10',
  out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0'
};
export const Icon = ({ n }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={P[n] || P.box} /></svg>
);

/* ---------- Formato ---------- */
export function useFmt() {
  const { config } = useAuth();
  const cur = config.MONEDA || 'CLP';
  const dec = ['CLP', 'COP', 'PYG', 'JPY'].includes(cur) ? 0 : 2;
  const money = (n) => {
    try { return Number(n || 0).toLocaleString('es-CL', { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec }); }
    catch { return String(Math.round(Number(n || 0))); }
  };
  return { money };
}
export const fdate = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return d ? `${d}-${m}-${y}` : s; };
export const fdt = (s) => (s ? `${fdate(s)} ${String(s).slice(11, 16)}` : '');
export const today = () => new Date().toLocaleDateString('en-CA');
export const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

/* ---------- Avisos ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, err) => {
    const id = Math.random();
    setItems((a) => [...a, { id, text, err }]);
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), err ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">{items.map((t) => <div key={t.id} className={'toast' + (t.err ? ' err' : '')}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay no-print-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
        <div className="modalhead no-print"><h2 className="grow">{title}</h2><button className="x" onClick={onClose} aria-label="Cerrar">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ text, onYes, onNo, yesText = 'Eliminar' }) {
  return (
    <Modal title="Confirmar" onClose={onNo}>
      <p>{text}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onNo}>Cancelar</button>
        <button className="btn danger" onClick={onYes}>{yesText}</button>
      </div>
    </Modal>
  );
}

/* ---------- Escáner de código de barras (cámara, gratis) ---------- */
export function Scanner({ onCode, onClose }) {
  const video = useRef(null);
  const [msg, setMsg] = useState('Apunta la cámara al código de barras');
  useEffect(() => {
    let stream; let stop = false;
    (async () => {
      if (!('BarcodeDetector' in window)) { setMsg('Tu navegador no soporta escáner. Usa Chrome en Android o escribe el código a mano.'); return; }
      try {
        const det = new window.BarcodeDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.current.srcObject = stream; await video.current.play();
        const tick = async () => {
          if (stop) return;
          try { const r = await det.detect(video.current); if (r.length) { onCode(r[0].rawValue); return; } } catch { /* seguir */ }
          requestAnimationFrame(tick);
        };
        tick();
      } catch { setMsg('No se pudo abrir la cámara. Revisa los permisos del navegador.'); }
    })();
    return () => { stop = true; stream && stream.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <Modal title="Escanear código" onClose={onClose}>
      <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000', minHeight: 200 }} />
      <p className="muted small">{msg}</p>
    </Modal>
  );
}

/* ---------- Campo de imagen / archivo ---------- */
export function FileInput({ value, onChange, modulo, accept = 'image/*', label = 'Subir imagen' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pdf = accept.includes('pdf');
  return (
    <div className="row">
      {value && !pdf && <img className="thumb" src={value} alt="" />}
      {value && pdf && <a href={value} target="_blank" rel="noreferrer">Ver PDF</a>}
      <label className="btn sm" style={{ cursor: 'pointer' }}>
        {busy ? 'Subiendo…' : value ? 'Cambiar' : label}
        <input type="file" accept={accept} hidden disabled={busy} onChange={async (e) => {
          const f = e.target.files[0]; e.target.value = '';
          if (!f) return;
          setBusy(true);
          try { const r = await subirArchivo(f, modulo); onChange(r.url); } catch (err) { toast(err.message, true); }
          setBusy(false);
        }} />
      </label>
      {value && <button type="button" className="btn sm" onClick={() => onChange('')}>Quitar</button>}
    </div>
  );
}

/* ---------- Barras simples ---------- */
export function BarList({ rows, label, value, fmt = (n) => n }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  if (!rows.length) return <p className="muted">Sin datos en este período.</p>;
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div className="b" key={i}>
          <span title={r[label]}>{r[label]}</span>
          <div className="track"><div className="fill" style={{ width: ((Number(r[value]) || 0) / max) * 100 + '%' }} /></div>
          <b>{fmt(r[value])}</b>
        </div>
      ))}
    </div>
  );
}

export const Brand = ({ size = 40 }) => {
  const { brand } = useAuth();
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [brand.LOGO]);
  return brand.LOGO && !bad
    ? <img src={brand.LOGO} alt={brand.NOMBRE_NEGOCIO} onError={() => setBad(true)} style={{ width: size, height: size, objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
    : <div className="logo-ph" style={{ width: size, height: size }}>{(brand.NOMBRE_NEGOCIO || 'N').slice(0, 1).toUpperCase()}</div>;
};
