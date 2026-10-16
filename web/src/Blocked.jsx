import { useState } from 'react';
import { useAuth } from './auth.jsx';
import { Icon, fdate, Brand } from './ui.jsx';

// Pantalla que reemplaza TODA la app cuando la suscripción está vencida o suspendida
export default function Blocked() {
  const { licencia, brand, recheck } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const titulo = { vencido: 'Suscripción vencida', suspendido: 'Servicio suspendido' }[licencia.estado] || 'Servicio no disponible';
  const texto = `Hola, soy de ${brand.NOMBRE_NEGOCIO}. ${licencia.estado === 'vencido' ? 'Mi suscripción venció' + (licencia.vencimiento ? ' el ' + fdate(licencia.vencimiento) : '') + ' y quiero renovarla.' : 'Mi sistema está bloqueado y necesito ayuda.'}`;
  const wa = licencia.whatsapp ? `https://wa.me/${licencia.whatsapp}?text=${encodeURIComponent(texto)}` : '';
  const retry = async () => {
    setBusy(true); setMsg('');
    try { const ok = await recheck(); if (!ok) setMsg('Todavía figura bloqueado. Si ya renovaste, espera un par de minutos e inténtalo otra vez.'); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <div className="login">
      <div className="card stack" style={{ textAlign: 'center' }} role="alert">
        <div style={{ display: 'grid', placeItems: 'center' }}><Brand size={64} /></div>
        <div style={{ color: 'var(--bad)', display: 'grid', placeItems: 'center' }}><div style={{ width: 44, height: 44 }}><Icon n="lock" /></div></div>
        <h1>{titulo}</h1>
        <p style={{ margin: 0 }}>{licencia.mensaje}</p>
        {(licencia.plan || licencia.vencimiento) && <p className="muted small" style={{ margin: 0 }}>{licencia.plan && <>Plan {licencia.plan}</>}{licencia.plan && licencia.vencimiento && ' · '}{licencia.vencimiento && <>Venció el {fdate(licencia.vencimiento)}</>}</p>}
        {wa && <a className="btn ok" href={wa} target="_blank" rel="noreferrer">Contactar por WhatsApp</a>}
        <button className="btn" onClick={retry} disabled={busy}>{busy ? 'Verificando…' : 'Ya renové, reintentar'}</button>
        {msg && <div className="alert info small">{msg}</div>}
      </div>
    </div>
  );
}
