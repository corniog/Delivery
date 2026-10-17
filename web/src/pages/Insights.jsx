import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { call, listar } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon, Modal, BarList, useFmt, useToast, fdt, today, daysAgo, Confirm } from '../ui.jsx';
import { Comprobantes } from '../Comanda.jsx';
import { DeliveryHistory } from './Delivery.jsx';
import { SubscriptionBanner } from '../Suscripcion.jsx';

export function Dashboard() {
  const { user, can, feat, brand } = useAuth();
  const { money } = useFmt();
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [k, setK] = useState(null);
  const load = useCallback(async () => {
    try { setAlerts((await listar('Alertas')).filter((a) => String(a.Leida).toUpperCase() !== 'TRUE').sort((a, b) => (a.Fecha < b.Fecha ? 1 : -1))); } catch { /* sin permiso */ }
    if (can('KPI', 'Ver') && feat('kpi')) { try { setK(await call('kpi', { desde: today(), hasta: today() })); } catch { /* ignorar */ } }
  }, [can]);
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  const read = async (ids, todas) => { try { await call('marcarAlertas', { ids, todas }); load(); } catch (e) { toast(e.message, true); } };
  return (
    <div className="stack">
      <div className="pagehead"><h1>Hola, {user.Nombre.split(' ')[0]}</h1><span className="muted">{brand.NOMBRE_NEGOCIO}</span></div>
      <SubscriptionBanner />
      {alerts.length > 0 && (
        <div className="stack">
          <div className="row"><h2 className="grow"><Icon n="bell" /> Alertas ({alerts.length})</h2><button className="btn sm" onClick={() => read([], true)}>Marcar todas como leídas</button></div>
          {alerts.slice(0, 8).map((a) => (
            <div key={a.ID_Alerta} className={'alert' + (a.Tipo.startsWith('Delivery') ? ' info' : '')}>
              <div className="grow"><b>{a.Tipo}</b><div>{a.Mensaje}</div><div className="muted small">{fdt(a.Fecha)}</div></div>
              <button className="btn sm" onClick={() => read([a.ID_Alerta])}>Listo</button>
            </div>))}
        </div>)}
      {k && (
        <div className="grid cols">
          <div className="card stat"><span className="muted">Ventas hoy</span><b>{k.ventas}</b></div>
          <div className="card stat"><span className="muted">Monto hoy</span><b>{money(k.total)}</b></div>
          <div className="card stat"><span className="muted">Ticket promedio</span><b>{money(k.ticketPromedio)}</b></div>
          <div className="card stat"><span className="muted">Bajo stock mínimo</span><b>{k.bajoStock.length}</b></div>
        </div>)}
      <div className="grid cols">
        {can('Ventas', 'Crear') && <Link className="card stat" to="/vender"><Icon n="cart" /><b>Vender</b></Link>}
        {can('Inventario', 'Ver') && <Link className="card stat" to="/inventario"><Icon n="box" /><b>Inventario</b></Link>}
        {can('Delivery', 'Ver') && feat('delivery') && <Link className="card stat" to="/delivery"><Icon n="truck" /><b>Delivery</b></Link>}
        {can('Historial', 'Ver') && <Link className="card stat" to="/historial"><Icon n="clock" /><b>Historial</b></Link>}
      </div>
    </div>
  );
}

export function Historial() {
  const { can } = useAuth();
  const [tab, setTab] = useState('ventas');
  return (
    <div className="stack">
      <div className="pagehead"><h1>Historial</h1></div>
      <div className="tabs">
        <button className={tab === 'ventas' ? 'on' : ''} onClick={() => setTab('ventas')}>Ventas</button>
        {can('Delivery', 'Ver') && feat('delivery') && <button className={tab === 'del' ? 'on' : ''} onClick={() => setTab('del')}>Delivery</button>}
        {can('Inventario', 'Ver') && <button className={tab === 'mov' ? 'on' : ''} onClick={() => setTab('mov')}>Movimientos de stock</button>}
      </div>
      {tab === 'ventas' && <HistVentas />}
      {tab === 'del' && <DeliveryHistory />}
      {tab === 'mov' && <HistMov />}
    </div>
  );
}

function HistVentas() {
  const { money } = useFmt();
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ desde: daysAgo(30), hasta: today(), q: '' });
  const [r, setR] = useState(null);
  const [det, setDet] = useState(null);
  const [anular, setAnular] = useState(null);
  const load = useCallback(async () => {
    try { setR(await call('listarVentas', { desde: f.desde, hasta: f.hasta })); } catch (e) { toast(e.message, true); setR({ rows: [], total: 0, cantidad: 0 }); }
  }, [f.desde, f.hasta, toast]);
  useEffect(() => { load(); }, [load]);
  const s = f.q.trim().toLowerCase();
  const rows = r ? r.rows.filter((v) => !s || [v.ID_Venta, v.Cliente, v.Metodo_Pago, v.Estado].some((x) => String(x || '').toLowerCase().includes(s))) : [];
  const total = rows.filter((v) => v.Estado !== 'Anulada').reduce((a, v) => a + Number(v.Total), 0);
  const open = async (v) => { try { setDet(await call('detalleVenta', { ID_Venta: v.ID_Venta })); } catch (e) { toast(e.message, true); } };
  const doAnular = async () => {
    try { await call('anularVenta', { ID_Venta: anular.ID_Venta, motivo: 'Anulada desde historial' }); toast('Venta anulada y stock restituido'); } catch (e) { toast(e.message, true); }
    setAnular(null); setDet(null); load();
  };
  return (
    <div className="stack">
      <div className="row">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar venta, cliente…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <label className="row small muted">Desde <input className="input" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
        <label className="row small muted">Hasta <input className="input" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
      </div>
      <div className="card" style={{ padding: 6 }}>
        {!r ? <p className="muted" style={{ padding: 12 }}>Cargando…</p> : !rows.length ? <p className="muted" style={{ padding: 12 }}>No hay ventas en este filtro.</p> : (
          <table className="t">
            <thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Pago</th><th>Estado</th><th className="right">Total</th></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.ID_Venta} onClick={() => open(v)} style={{ cursor: 'pointer', opacity: v.Estado === 'Anulada' ? 0.5 : 1 }}>
                <td data-label="Venta"><b>{v.ID_Venta}</b></td><td data-label="Fecha">{fdt(v.Fecha_Hora)}</td><td data-label="Cliente">{v.Cliente || '—'}</td>
                <td data-label="Entrega">{v.Tipo_Entrega}</td><td data-label="Pago">{v.Metodo_Pago}</td>
                <td data-label="Estado"><span className={'badge ' + (v.Estado === 'Anulada' ? 'bad' : v.Estado === 'Entregada' ? 'ok' : '')}>{v.Estado}</span></td>
                <td data-label="Total" className="right">{money(v.Total)}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={6}>Total del filtro ({rows.filter((v) => v.Estado !== 'Anulada').length} ventas válidas)</td><td className="right">{money(total)}</td></tr></tfoot>
          </table>)}
      </div>
      {det && (
        <Modal title={'Venta ' + det.venta.ID_Venta} onClose={() => setDet(null)} wide>
          <Comprobantes data={det} extra={can('Ventas', 'Eliminar') && det.venta.Estado !== 'Anulada' && <button className="btn danger" onClick={() => setAnular(det.venta)}>Anular venta</button>} />
        </Modal>)}
      {anular && <Confirm yesText="Anular" text={`¿Anular la venta ${anular.ID_Venta}? Se devolverá el stock de los productos.`} onYes={doAnular} onNo={() => setAnular(null)} />}
    </div>
  );
}

function HistMov() {
  const [rows, setRows] = useState(null);
  const [prods, setProds] = useState({});
  const [q, setQ] = useState('');
  useEffect(() => {
    listar('Movimientos_Inventario').then((r) => setRows(r.sort((a, b) => (a.Fecha < b.Fecha ? 1 : -1)))).catch(() => setRows([]));
    listar('Productos').then((p) => setProds(Object.fromEntries(p.map((x) => [x.ID_Producto, x.Nombre])))).catch(() => {});
  }, []);
  const s = q.trim().toLowerCase();
  const shown = (rows || []).filter((m) => !s || [prods[m.ID_Producto], m.Tipo, m.Referencia, m.Usuario].some((x) => String(x || '').toLowerCase().includes(s))).slice(0, 300);
  return (
    <div className="stack">
      <input className="input" style={{ maxWidth: 300 }} placeholder="Buscar producto, tipo, venta…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card" style={{ padding: 6 }}>
        {!rows ? <p className="muted" style={{ padding: 12 }}>Cargando…</p> : !shown.length ? <p className="muted" style={{ padding: 12 }}>Sin movimientos.</p> : (
          <table className="t">
            <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock</th><th>Ref.</th><th>Usuario</th></tr></thead>
            <tbody>{shown.map((m) => (
              <tr key={m.ID_Mov}><td data-label="Fecha">{fdt(m.Fecha)}</td><td data-label="Producto">{prods[m.ID_Producto] || m.ID_Producto}</td><td data-label="Tipo">{m.Tipo}</td>
                <td data-label="Cantidad">{Number(m.Cantidad)}</td><td data-label="Stock">{Number(m.Stock_Antes)} → {Number(m.Stock_Despues)}</td><td data-label="Ref.">{m.Referencia}</td><td data-label="Usuario">{m.Usuario}</td></tr>))}</tbody>
          </table>)}
      </div>
    </div>
  );
}

export function Kpi() {
  const { money } = useFmt();
  const toast = useToast();
  const [f, setF] = useState({ desde: daysAgo(30), hasta: today() });
  const [k, setK] = useState(null);
  useEffect(() => { call('kpi', f).then(setK).catch((e) => toast(e.message, true)); }, [f]); // eslint-disable-line
  return (
    <div className="stack">
      <div className="pagehead"><h1>KPI</h1>
        <label className="row small muted">Desde <input className="input" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
        <label className="row small muted">Hasta <input className="input" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
      </div>
      {!k ? <p className="muted">Cargando…</p> : (
        <>
          <div className="grid cols">
            <div className="card stat"><span className="muted">Ventas</span><b>{k.ventas}</b></div>
            <div className="card stat"><span className="muted">Monto vendido</span><b>{money(k.total)}</b></div>
            <div className="card stat"><span className="muted">Ticket promedio</span><b>{money(k.ticketPromedio)}</b></div>
            <div className="card stat"><span className="muted">Margen estimado</span><b>{money(k.margen)}</b></div>
          </div>
          <div className="grid cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            <div className="card"><h2>Productos más vendidos</h2><BarList rows={k.topProductos} label="nombre" value="cantidad" /></div>
            <div className="card"><h2>Ventas por día de la semana</h2><BarList rows={k.porDia} label="dia" value="ventas" /></div>
            <div className="card"><h2>Movimiento por hora</h2><BarList rows={k.porHora} label="hora" value="ventas" /></div>
            <div className="card"><h2>Ventas por categoría</h2><BarList rows={k.porCategoria} label="categoria" value="monto" fmt={money} /></div>
            <div className="card"><h2>Delivery por repartidor</h2><BarList rows={k.delivery} label="nombre" value="monto" fmt={money} />
              {k.delivery.map((d) => <div key={d.nombre} className="muted small">{d.nombre}: {d.servicios} servicio(s) · {d.km} km</div>)}</div>
            <div className="card"><h2>Bajo stock mínimo</h2>
              {k.bajoStock.length ? k.bajoStock.map((p) => <div key={p.nombre} className="row" style={{ justifyContent: 'space-between' }}><span>{p.nombre}</span><span className="badge bad">{p.stock} / mín. {p.minimo}</span></div>) : <p className="muted">Todo en orden.</p>}</div>
          </div>
        </>)}
    </div>
  );
}

const HOJAS = [['Productos', 'Inventario (productos)'], ['Categorias', 'Categorías'], ['Movimientos_Inventario', 'Movimientos de stock'], ['Ventas', 'Ventas'], ['Detalle_Venta', 'Detalle de ventas'],
  ['Clientes', 'Clientes'], ['Proveedores', 'Proveedores'], ['Deliverys', 'Repartidores'], ['Servicios_Delivery', 'Servicios de delivery']];
export function Reportes() {
  const toast = useToast();
  const { feat } = useAuth();
  const hojas = HOJAS.filter(([k]) => feat('delivery') || !['Deliverys', 'Servicios_Delivery'].includes(k)).filter(([k]) => feat('compras') || k !== 'Proveedores');
  const [sel, setSel] = useState(['Productos', 'Ventas', 'Detalle_Venta']);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const data = await call('exportar', { hojas: sel });
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      Object.keys(data).forEach((h) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data[h]), h.slice(0, 31)));
      if (!wb.SheetNames.length) throw new Error('No tienes permiso para ninguna de las hojas elegidas');
      XLSX.writeFile(wb, `reporte_${today()}.xlsx`);
      toast('Reporte descargado');
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <div className="pagehead"><h1>Reportes</h1></div>
      <div className="card stack">
        <h2>Descargar Excel</h2>
        <p className="muted">Elige qué hojas incluir. Los usuarios y permisos nunca se exportan.</p>
        <div className="formgrid">{hojas.map(([k, l]) => (
          <label key={k} className="chk"><input type="checkbox" checked={sel.includes(k)} onChange={(e) => setSel(e.target.checked ? [...sel, k] : sel.filter((x) => x !== k))} />{l}</label>))}</div>
        <div><button className="btn primary" disabled={busy || !sel.length} onClick={go}>{busy ? 'Generando…' : 'Descargar Excel'}</button></div>
      </div>
    </div>
  );
}
