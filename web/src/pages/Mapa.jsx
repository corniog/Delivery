import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { call } from '../api.js';
import { useToast, fdt } from '../ui.jsx';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
};
export const startSharing = () => { store.set('share_loc', '1'); window.dispatchEvent(new Event('share-loc')); };

/* ---------- Lado repartidor: comparte su posición mientras la app está abierta ---------- */
export function ShareLocation() {
  const [on, setOn] = useState(() => store.get('share_loc') === '1');
  const [status, setStatus] = useState('');
  const pos = useRef(null);
  useEffect(() => {
    const h = () => setOn(store.get('share_loc') === '1');
    window.addEventListener('share-loc', h);
    return () => window.removeEventListener('share-loc', h);
  }, []);
  useEffect(() => {
    if (!on) { setStatus(''); return undefined; }
    if (!navigator.geolocation) { setStatus('Este dispositivo no permite ubicación.'); return undefined; }
    let wake = null;
    const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ } };
    keepAwake();
    const onVis = () => { if (document.visibilityState === 'visible') keepAwake(); };
    document.addEventListener('visibilitychange', onVis);
    const w = navigator.geolocation.watchPosition(
      (p) => { pos.current = p.coords; setStatus('Compartiendo ubicación'); },
      (e) => setStatus(e.code === 1 ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador/app.' : 'No se pudo obtener la ubicación.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
    let last = 0;
    const send = async () => {
      const c = pos.current;
      if (!c || Date.now() - last < 15000) return;
      last = Date.now();
      try { await call('ubicacion', { lat: c.latitude, lng: c.longitude }); } catch { /* reintenta en el próximo ciclo */ }
    };
    const t = setInterval(send, 20000);
    const first = setTimeout(send, 4000);
    return () => {
      navigator.geolocation.clearWatch(w); clearInterval(t); clearTimeout(first);
      document.removeEventListener('visibilitychange', onVis);
      try { wake?.release(); } catch { /* ignorar */ }
    };
  }, [on]);
  const toggle = () => { store.set('share_loc', on ? '0' : '1'); setOn(!on); };
  return (
    <div className={'alert' + (on ? ' info' : '')}>
      <div className="grow">
        <b>{on ? 'Ubicación en vivo activada' : 'Ubicación en vivo apagada'}</b>
        <div className="small muted">{on ? (status || 'Buscando señal GPS…') + ' · Mantén esta pantalla abierta mientras repartes.' : 'Actívala para que el negocio vea dónde vas.'}</div>
      </div>
      <button className={'btn sm ' + (on ? '' : 'primary')} onClick={toggle}>{on ? 'Detener' : 'Compartir'}</button>
    </div>
  );
}

/* ---------- Lado administración: mapa con todos los repartidores ---------- */
const mk = (cls, text) => { const e = document.createElement('div'); e.className = cls; e.textContent = text; return e; };
const colorOf = (r) => (r.lat == null ? 'off' : r.hace_min != null && r.hace_min > 10 ? 'old' : r.servicios.length ? 'busy' : 'free');

export function MapaVivo() {
  const toast = useToast();
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true }).setView([-33.45, -70.66], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    const fix = setTimeout(() => map.current && map.current.invalidateSize(), 200);
    return () => { clearTimeout(fix); map.current.remove(); map.current = null; };
  }, []);

  const load = useCallback(async () => {
    try { setData(await call('mapaVivo')); } catch (e) { toast(e.message, true); }
  }, [toast]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!data || !map.current) return;
    const g = layer.current; g.clearLayers();
    const pts = [];
    if (data.origen) {
      L.marker(data.origen, { icon: L.divIcon({ className: '', html: mk('mk mk-store', '⌂'), iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindTooltip('Local').addTo(g);
      pts.push(data.origen);
    }
    data.repartidores.forEach((r) => {
      if (r.ruta && r.ruta.length > 1) L.polyline(r.ruta, { color: '#4f46e5', weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(g);
      r.servicios.forEach((s) => {
        if (!s.dest) return;
        L.marker(s.dest, { icon: L.divIcon({ className: '', html: mk('mk mk-dest', '●'), iconSize: [18, 18], iconAnchor: [9, 9] }) })
          .bindTooltip((s.Cliente || 'Cliente') + ' — ' + (s.Direccion_Entrega || '') + ' (' + s.Estado + ')').addTo(g);
        pts.push(s.dest);
        if (r.lat != null && s.Estado !== 'Asignado') L.polyline([[r.lat, r.lng], s.dest], { color: '#f59e0b', weight: 2, opacity: 0.8, dashArray: '2 6' }).addTo(g);
      });
      if (r.lat != null) {
        const ini = String(r.Nombre || '?').trim().charAt(0).toUpperCase();
        L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: mk('mk mk-rep ' + colorOf(r), ini), iconSize: [34, 34], iconAnchor: [17, 17] }) })
          .bindTooltip(r.Nombre + (r.hace_min != null ? ' · hace ' + r.hace_min + ' min' : '')).addTo(g);
        pts.push([r.lat, r.lng]);
      }
    });
    if (!fitted.current && pts.length) { map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); fitted.current = true; }
  }, [data]);

  const focus = (r) => { if (r.lat != null && map.current) map.current.setView([r.lat, r.lng], 16); };
  const ago = (r) => (r.lat == null ? 'Sin ubicación' : r.hace_min === 0 ? 'ahora' : r.hace_min != null ? 'hace ' + r.hace_min + ' min' : fdt(r.Fecha_Ubicacion));
  return (
    <div className="stack">
      <div ref={el} className="livemap" role="application" aria-label="Mapa de repartidores" />
      <div className="row small muted">
        <span><i className="dot free" /> Disponible</span><span><i className="dot busy" /> Con pedido</span><span><i className="dot old" /> Sin señal &gt;10 min</span><span><i className="dot off" /> Sin ubicación</span>
        <span className="grow" /><span>Se actualiza cada 15 s</span>
      </div>
      {data && !data.repartidores.length && <div className="card muted">No hay repartidores activos. Créalos en la pestaña Repartidores.</div>}
      <div className="grid cards">
        {data && data.repartidores.map((r) => (
          <button key={r.ID_Delivery} className="card stack" style={{ textAlign: 'left', cursor: r.lat == null ? 'default' : 'pointer' }} onClick={() => focus(r)}>
            <div className="row"><i className={'dot ' + colorOf(r)} /><b className="grow">{r.Nombre}</b><span className="muted small">{ago(r)}</span></div>
            <div className="muted small">{r.Vehiculo || ''}{r.Telefono && ' · ' + r.Telefono}</div>
            {r.servicios.length ? r.servicios.map((s) => <div key={s.ID_Servicio} className="small">{s.ID_Venta} · {s.Estado} · {s.Direccion_Entrega || 'sin dirección'}</div>) : <div className="small muted">Sin pedidos en curso</div>}
          </button>))}
      </div>
    </div>
  );
}
