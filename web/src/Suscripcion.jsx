import { useEffect, useState } from 'react';
import { call } from './api.js';
import { useAuth } from './auth.jsx';
import { fdate } from './ui.jsx';

export function useSubscription() {
  const { user } = useAuth();
  const [sub, setSub] = useState(null);
  useEffect(() => {
    if (user && user.ID_Rol === 'R01') call('suscripcion').then(setSub).catch(() => setSub(null));
  }, [user]);
  return sub;
}

export function waLink(sub, negocio) {
  const msg = `Hola, soy de ${negocio}. Quiero consultar por mi plan${sub.plan ? ' ' + sub.plan : ''}${sub.vencimiento ? ' (vence el ' + fdate(sub.vencimiento) + ')' : ''}.`;
  return `https://wa.me/${sub.whatsapp}?text=${encodeURIComponent(msg)}`;
}

export function diasTexto(sub) {
  const n = sub.diasRestantes;
  if (n === null || n === undefined) return 'Sin vencimiento';
  if (n < 0) return `Vencido hace ${-n} día${n === -1 ? '' : 's'}`;
  if (n === 0) return 'Vence hoy';
  return n === 1 ? 'Queda 1 día' : `Quedan ${n} días`;
}
const cls = { activo: 'ok', por_vencer: 'warn', vencido: 'bad', sin_vencimiento: '', fecha_invalida: 'warn' };

function WhatsAppBtn({ sub, label = 'Contactar por WhatsApp' }) {
  const { brand } = useAuth();
  if (!sub.whatsapp) return null;
  return <a className="btn ok" href={waLink(sub, brand.NOMBRE_NEGOCIO)} target="_blank" rel="noreferrer">{label}</a>;
}

// Tarjeta en Configuración (solo Master)
export function SubscriptionCard() {
  const sub = useSubscription();
  if (!sub || sub.estado === 'sin_control') return null;
  return (
    <div className="card stack">
      <h2>Mi suscripción</h2>
      <div className="formgrid">
        <div><div className="muted small">Plan</div><b>{sub.plan || '—'}</b></div>
        <div><div className="muted small">Vencimiento</div><b>{sub.vencimiento ? fdate(sub.vencimiento) : 'Sin vencimiento'}</b></div>
        <div><div className="muted small">Estado</div>
          {sub.estado === 'fecha_invalida'
            ? <span className="badge warn">No se pudo leer la fecha</span>
            : <span className={'badge ' + (cls[sub.estado] || '')}>{diasTexto(sub)}</span>}
        </div>
      </div>
      <div className="row"><WhatsAppBtn sub={sub} /></div>
    </div>
  );
}

// Aviso en Inicio (solo Master, solo si vence en 7 días o ya venció)
export function SubscriptionBanner() {
  const sub = useSubscription();
  if (!sub || !['por_vencer', 'vencido'].includes(sub.estado)) return null;
  return (
    <div className="alert">
      <div className="grow"><b>{sub.estado === 'vencido' ? 'Tu suscripción venció' : 'Tu suscripción está por vencer'}</b>
        <div>Plan {sub.plan || '—'} · {fdate(sub.vencimiento)} · {diasTexto(sub)}</div></div>
      <WhatsAppBtn sub={sub} label="Renovar por WhatsApp" />
    </div>
  );
}
