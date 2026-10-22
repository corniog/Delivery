import { useEffect, useState, useCallback } from 'react';
import { call } from '../api.js';
import { useAuth } from '../auth.jsx';
import Crud from '../Crud.jsx';
import { MapaVivo, ShareLocation, startSharing } from './Mapa.jsx';
import { Modal, useToast, useFmt, fdt, today, daysAgo, Icon } from '../ui.jsx';

const estadoCls = { Asignado: 'warn', Aceptado: '', 'En camino': '', Finalizado: 'ok', Rechazado: 'bad', Cancelado: 'bad' };
const mapsLink = (addr) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr || '');

export default function Delivery() {
  const { can, feat, isDelivery } = useAuth();
  const [tab, setTab] = useState('servicios');
  return (
    <div className="stack">
      <div className="pagehead"><h1>{isDelivery ? 'Mis pedidos' : 'Delivery'}</h1></div>
      <div className="tabs">
        <button className={tab === 'servicios' ? 'on' : ''} onClick={() => setTab('servicios')}>{isDelivery ? 'Pendientes' : 'Servicios activos'}</button>
        {!isDelivery && can('Delivery', 'Ver') && <button className={tab === 'rep' ? 'on' : ''} onClick={() => setTab('rep')}>Repartidores</button>}
        {!isDelivery && can('Delivery', 'Ver') && feat('mapa') && <button className={tab === 'mapa' ? 'on' : ''} onClick={() => setTab('mapa')}>Mapa en vivo</button>}
        <button className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>Historial</button>
      </div>
      {isDelivery && <ShareLocation />}
      {tab === 'mapa' && <MapaVivo />}
      {tab === 'servicios' && <Servicios />}
      {tab === 'rep' && <Repartidores />}
      {tab === 'hist' && <DeliveryHistory />}
    </div>
  );
}

function Servicios() {
  const { money } = useFmt();
  const toast = useToast();
  const { can, isDelivery } = useAuth();
  const [rows, setRows] = useState(null);
  const [fin, setFin] = useState(null);
  const load = useCallback(async () => {
    try { setRows(await call('misServicios', { estados: ['Asignado', 'Aceptado', 'En camino'] })); } catch (e) { toast(e.message, true); setRows([]); }
  }, [toast]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const set = async (s, estado, extra = {}) => {
    try { await call('servicioEstado', { ID_Servicio: s.ID_Servicio, estado, ...extra }); if (isDelivery && estado === 'Aceptado') startSharing(); toast('Actualizado'); load(); } catch (e) { toast(e.message, true); }
  };
  if (rows === null) return <p className="muted">Cargando…</p>;
  if (!rows.length) return <div className="card muted">No hay pedidos pendientes.</div>;
  const canAct = isDelivery || can('Delivery', 'Editar');
  return (
    <div className="grid cards">
      {rows.map((s) => (
        <div key={s.ID_Servicio} className="card stack">
          <div className="row"><b className="grow">{s.ID_Venta}</b><span className={'badge ' + (estadoCls[s.Estado] || '')}>{s.Estado}</span></div>
          {!isDelivery && <div className="muted small">Repartidor: {s.Nombre_Delivery}</div>}
          <div><b>{s.Cliente || 'Cliente general'}</b>{s.Cliente_Telefono && <> · <a href={'tel:' + s.Cliente_Telefono}>{s.Cliente_Telefono}</a></>}</div>
          <div>{s.Direccion_Entrega || 'Sin dirección'}</div>
          {s.Direccion_Entrega && <a href={mapsLink(s.Direccion_Entrega)} target="_blank" rel="noreferrer">Ver ruta, tiempo y kilómetros en el mapa →</a>}
          <ul style={{ margin: 0, paddingLeft: 18 }}>{s.items.map((i, k) => <li key={k}>{Number(i.Cantidad)} × {i.Nombre}</li>)}</ul>
          {s.Notas && <div className="alert info small">{s.Notas}</div>}
          <div className="row small muted"><span>Servicio: {money(s.Monto_Delivery)}</span><span>· Pedido {money(s.Total_Venta)} ({s.Estado_Pago})</span>{Number(s.Distancia_Km) > 0 && <span>· {s.Distancia_Km} km</span>}</div>
          <div className="muted small">Asignado {fdt(s.Fecha_Asignacion)}</div>
          {canAct && (
            <div className="row">
              {s.Estado === 'Asignado' && <><button className="btn ok" onClick={() => set(s, 'Aceptado')}>Aceptar</button><button className="btn danger" onClick={() => set(s, 'Rechazado')}>Rechazar</button></>}
              {s.Estado === 'Aceptado' && <button className="btn primary" onClick={() => set(s, 'En camino')}>Salí a entregar</button>}
              {(s.Estado === 'Aceptado' || s.Estado === 'En camino') && <button className="btn ok" onClick={() => setFin(s)}>Finalizar</button>}
              {(s.Estado === 'Aceptado' || s.Estado === 'En camino') && <button className="btn danger" onClick={() => { if (window.confirm('¿Cancelar esta entrega? Se avisará a la administración.')) set(s, 'Cancelado'); }}>Cancelar</button>}
            </div>)}
        </div>))}
      {fin && <FinModal s={fin} onClose={() => setFin(null)} onSave={(x) => { set(fin, 'Finalizado', x); setFin(null); }} />}
    </div>
  );
}
function FinModal({ s, onClose, onSave }) {
  const [km, setKm] = useState(s.Distancia_Km || '');
  const [min, setMin] = useState(s.Tiempo_Min || '');
  return (
    <Modal title="Finalizar entrega" onClose={onClose}>
      <div className="stack">
        <p className="muted">Si conoces el recorrido, anótalo (es opcional).</p>
        <div className="formgrid">
          <label className="f">Kilómetros<input className="input" type="number" step="any" value={km} onChange={(e) => setKm(e.target.value)} /></label>
          <label className="f">Minutos<input className="input" type="number" value={min} onChange={(e) => setMin(e.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn ok" onClick={() => onSave({ Distancia_Km: km, Tiempo_Min: min })}>Marcar como entregado</button></div>
      </div>
    </Modal>
  );
}

function Repartidores() {
  const { money } = useFmt();
  return (
    <Crud title="Repartidor" tabla="Deliverys" module="Delivery" idKey="ID_Delivery" hideTitle searchKeys={['Nombre', 'Telefono', 'Patente']} defaults={{ Activo: true }}
      fields={[
        { key: 'Nombre', label: 'Nombre', required: true }, { key: 'Telefono', label: 'Teléfono' }, { key: 'Email', label: 'Correo' },
        { key: 'Vehiculo', label: 'Vehículo', type: 'select', options: ['Moto', 'Bicicleta', 'Auto', 'A pie'] }, { key: 'Patente', label: 'Patente' },
        { key: 'Tarifa_Base', label: 'Tarifa base', type: 'number' }, { key: 'Tarifa_Km', label: 'Tarifa por km', type: 'number' },
        { key: 'Activo', label: 'Activo', type: 'bool' }
      ]}
      columns={[{ key: 'Nombre', label: 'Repartidor' }, { key: 'Telefono', label: 'Teléfono' }, { key: 'Vehiculo', label: 'Vehículo' },
        { key: 'Tarifa_Base', label: 'Tarifa base', render: (r) => money(r.Tarifa_Base) }, { key: 'Activo', label: 'Activo', type: 'bool' }]} />
  );
}

// Historial con filtro por nombre y rango de fechas + total del filtro
export function DeliveryHistory() {
  const { money } = useFmt();
  const { isDelivery } = useAuth();
  const [f, setF] = useState({ nombre: '', desde: daysAgo(30), hasta: today() });
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setR(await call('historialDelivery', f)); setErr(''); } catch (e) { setErr(e.message); setR({ rows: [], total: 0, km: 0, servicios: 0 }); }
  }, [f]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="stack">
      <div className="row">
        {!isDelivery && <input className="input" style={{ maxWidth: 240 }} placeholder="Buscar repartidor…" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />}
        <label className="row small muted">Desde <input className="input" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
        <label className="row small muted">Hasta <input className="input" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card" style={{ padding: 6 }}>
        {!r ? <p className="muted" style={{ padding: 12 }}>Cargando…</p> : !r.rows.length ? <p className="muted" style={{ padding: 12 }}>No hay servicios en este filtro.</p> : (
          <table className="t">
            <thead><tr><th>Fecha</th><th>Repartidor</th><th>Pedido</th><th>Dirección</th><th>Km</th><th>Estado</th><th className="right">Monto</th></tr></thead>
            <tbody>{r.rows.map((s) => (
              <tr key={s.ID_Servicio}>
                <td data-label="Fecha">{fdt(s.Fecha_Asignacion)}</td><td data-label="Repartidor">{s.Nombre_Delivery}</td><td data-label="Pedido">{s.ID_Venta}</td>
                <td data-label="Dirección">{s.Direccion_Entrega}</td><td data-label="Km">{Number(s.Distancia_Km) || ''}</td>
                <td data-label="Estado"><span className={'badge ' + (estadoCls[s.Estado] || '')}>{s.Estado}</span></td>
                <td data-label="Monto" className="right">{money(s.Monto_Delivery)}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={5}>Total de {r.servicios} servicio(s) finalizados · {r.km} km</td><td /><td className="right">{money(r.total)}</td></tr></tfoot>
          </table>)}
      </div>
      <p className="muted small">El total suma solo los servicios finalizados dentro del filtro.</p>
    </div>
  );
}
