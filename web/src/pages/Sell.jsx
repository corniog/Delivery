import { useEffect, useMemo, useState } from 'react';
import { call, listar } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, Icon, Scanner, useToast, useFmt } from '../ui.jsx';
import Ticket from '../Ticket.jsx';

export default function Sell() {
  const { config } = useAuth();
  const { money } = useFmt();
  const toast = useToast();
  const [cats, setCats] = useState([]);
  const [prods, setProds] = useState([]);
  const [cat, setCat] = useState(null); // null = vista de categorías
  const [cart, setCart] = useState({}); // id -> cantidad
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [c, p] = await Promise.all([listar('Categorias'), listar('Productos')]);
      setCats(c.filter((x) => String(x.Activo).toUpperCase() !== 'FALSE').sort((a, b) => Number(a.Orden || 0) - Number(b.Orden || 0)));
      setProds(p.filter((x) => String(x.Activo).toUpperCase() !== 'FALSE'));
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => Object.fromEntries(prods.map((p) => [p.ID_Producto, p])), [prods]);
  const negative = String(config.PERMITIR_STOCK_NEGATIVO).toUpperCase() === 'TRUE';
  const setQty = (id, n) => {
    const p = byId[id];
    let v = Math.max(0, Number(n) || 0);
    if (!negative && v > Number(p.Stock_Actual)) { v = Number(p.Stock_Actual); toast(`Solo hay ${v} de ${p.Nombre}`, true); }
    setCart((c) => { const x = { ...c }; if (v > 0) x[id] = v; else delete x[id]; return x; });
  };
  const items = Object.keys(cart).map((id) => ({ ...byId[id], qty: cart[id] })).filter((x) => x.ID_Producto);
  const subtotal = items.reduce((s, p) => s + p.qty * Number(p.Precio_Venta), 0);
  const count = items.reduce((s, p) => s + p.qty, 0);

  const countInCat = (id) => prods.filter((p) => p.ID_Categoria === id).reduce((s, p) => s + (cart[p.ID_Producto] || 0), 0);

  const onCode = (code) => {
    setScan(false);
    const p = prods.find((x) => String(x.Codigo_Barras) === String(code) || String(x.SKU) === String(code));
    if (!p) { toast(`Código ${code} no encontrado`, true); return; }
    setQty(p.ID_Producto, (cart[p.ID_Producto] || 0) + 1);
    toast(`+1 ${p.Nombre}`);
  };

  const search = q.trim().toLowerCase();
  const list = search
    ? prods.filter((p) => [p.Nombre, p.Codigo_Barras, p.SKU].some((v) => String(v || '').toLowerCase().includes(search)))
    : cat ? prods.filter((p) => p.ID_Categoria === cat.ID_Categoria) : [];

  const Row = ({ p }) => {
    const n = cart[p.ID_Producto] || 0;
    const out = Number(p.Stock_Actual) <= 0 && !negative;
    return (
      <div className={'prow' + (n ? ' sel' : '')}>
        {p.Imagen ? <img className="thumb" src={p.Imagen} alt="" /> : <div className="thumb" />}
        <div className="grow">
          <b>{p.Nombre}</b>
          <div className="muted small">{money(p.Precio_Venta)} / {p.Unidad_Medida || 'un'} · stock {Number(p.Stock_Actual)}</div>
        </div>
        {out ? <span className="badge bad">Sin stock</span> : (
          <div className="stepper">
            <button aria-label="Menos" onClick={() => setQty(p.ID_Producto, n - 1)}>−</button>
            <input inputMode="decimal" value={n || ''} placeholder="0" onChange={(e) => setQty(p.ID_Producto, e.target.value)} />
            <button aria-label="Más" onClick={() => setQty(p.ID_Producto, n + 1)}>+</button>
          </div>)}
      </div>);
  };

  return (
    <div className="stack">
      <div className="pagehead"><h1>Vender</h1></div>
      {err && <div className="alert">{err}</div>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" placeholder="Buscar producto o código…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setScan(true)}><Icon n="scan" />Escanear</button>
      </div>

      {!search && cat && (
        <div className="row"><button className="btn" onClick={() => setCat(null)}>← Atrás</button><h2>{cat.Nombre}</h2></div>
      )}
      {!search && !cat && (
        cats.length ? (
          <div className="grid cols">
            {cats.map((c) => (
              <button key={c.ID_Categoria} className="tile" onClick={() => setCat(c)}>
                {c.Imagen ? <img src={c.Imagen} alt="" /> : <div className="ph">{String(c.Nombre).slice(0, 1)}</div>}
                <span>{c.Nombre}</span>
                {countInCat(c.ID_Categoria) > 0 && <div className="cnt">{countInCat(c.ID_Categoria)}</div>}
              </button>))}
          </div>) : <div className="card muted">Aún no hay categorías. Crea categorías y productos en Inventario.</div>
      )}
      {(search || cat) && (
        <div className="stack">
          {list.length ? list.map((p) => <Row key={p.ID_Producto} p={p} />) : <div className="card muted">No hay productos aquí.</div>}
        </div>)}

      {count > 0 && (
        <div className="cartbar">
          <div className="grow"><b>{count} producto(s)</b><div className="muted small">Subtotal {money(subtotal)}</div></div>
          <button className="btn" onClick={() => setCart({})}>Vaciar</button>
          <button className="btn primary" onClick={() => setCheckout(true)}><Icon n="cart" />Continuar</button>
        </div>)}

      {scan && <Scanner onCode={onCode} onClose={() => setScan(false)} />}
      {checkout && <Checkout items={items} subtotal={subtotal} setQty={setQty} onClose={() => setCheckout(false)}
        onDone={(r) => { setCheckout(false); setDone(r); setCart({}); load(); }} />}
      {done && (
        <Modal title="Venta registrada" onClose={() => setDone(null)}>
          <Ticket data={done} />
          <div className="row no-print" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn" onClick={() => setDone(null)}>Cerrar</button>
            <button className="btn primary" onClick={() => window.print()}>Imprimir</button>
          </div>
        </Modal>)}
    </div>
  );
}

function Checkout({ items, subtotal, setQty, onClose, onDone }) {
  const { config, can } = useAuth();
  const { money } = useFmt();
  const toast = useToast();
  const [clientes, setClientes] = useState([]);
  const [deliverys, setDeliverys] = useState([]);
  const [f, setF] = useState({
    ID_Cliente: '', tipoEntrega: 'Retiro en local', descuento: '', metodoPago: 'Efectivo', estadoPago: 'Pagado',
    tipoDocumento: 'Ticket', formato: config.FORMATO_DOC_DEFECTO || 'Termica 80mm',
    ID_Delivery: '', Direccion_Entrega: '', Distancia_Km: '', Monto_Delivery: config.TARIFA_BASE_DELIVERY || '', Notas: ''
  });
  const [newCli, setNewCli] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    listar('Clientes').then(setClientes).catch(() => {});
    listar('Deliverys').then((d) => setDeliverys(d.filter((x) => String(x.Activo).toUpperCase() !== 'FALSE'))).catch(() => {});
  }, []);

  const cliente = clientes.find((c) => c.ID_Cliente === f.ID_Cliente);
  useEffect(() => { if (cliente && !f.Direccion_Entrega) set('Direccion_Entrega', cliente.Direccion || ''); }, [f.ID_Cliente]); // eslint-disable-line

  // Calcula el monto del delivery con tarifa base + tarifa por km del repartidor elegido
  const dl = deliverys.find((d) => d.ID_Delivery === f.ID_Delivery);
  useEffect(() => {
    if (f.tipoEntrega !== 'Delivery' || !dl) return;
    const base = Number(dl.Tarifa_Base) || Number(config.TARIFA_BASE_DELIVERY) || 0;
    const km = Number(dl.Tarifa_Km) || Number(config.TARIFA_KM_DELIVERY) || 0;
    const dist = Number(f.Distancia_Km) || 0;
    if (base || km) set('Monto_Delivery', String(Math.round(base + km * dist)));
  }, [f.ID_Delivery, f.Distancia_Km]); // eslint-disable-line

  const desc = Math.max(0, Number(f.descuento) || 0);
  const envio = f.tipoEntrega === 'Delivery' ? Math.max(0, Number(f.Monto_Delivery) || 0) : 0;
  const total = subtotal - desc + envio;

  const saveClient = async (e) => {
    e.preventDefault();
    try {
      const c = await call('crear', { tabla: 'Clientes', datos: newCli });
      setClientes((a) => [...a, c]); set('ID_Cliente', c.ID_Cliente); setNewCli(null); toast('Cliente agregado');
    } catch (x) { toast(x.message, true); }
  };

  const confirm = async () => {
    setErr('');
    if (f.tipoEntrega === 'Delivery' && !f.ID_Delivery) { setErr('Selecciona el delivery'); return; }
    if (desc > subtotal) { setErr('El descuento no puede superar el subtotal'); return; }
    setBusy(true);
    try {
      const r = await call('crearVenta', {
        ID_Cliente: f.ID_Cliente, tipoEntrega: f.tipoEntrega, descuento: desc, metodoPago: f.metodoPago, estadoPago: f.estadoPago,
        tipoDocumento: f.tipoDocumento, formato: f.formato,
        items: items.map((p) => ({ ID_Producto: p.ID_Producto, Cantidad: p.qty })),
        delivery: f.tipoEntrega === 'Delivery' ? { ID_Delivery: f.ID_Delivery, Direccion_Entrega: f.Direccion_Entrega, Distancia_Km: Number(f.Distancia_Km) || 0, Monto_Delivery: envio, Notas: f.Notas } : null
      });
      onDone(r);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title="Confirmar pedido" onClose={onClose} wide>
      <div className="stack">
        <div className="card" style={{ padding: 8 }}>
          {items.map((p) => (
            <div key={p.ID_Producto} className="row" style={{ padding: '6px 8px', justifyContent: 'space-between' }}>
              <span className="grow">{p.Nombre}</span>
              <div className="stepper">
                <button onClick={() => setQty(p.ID_Producto, p.qty - 1)}>−</button>
                <input value={p.qty} onChange={(e) => setQty(p.ID_Producto, e.target.value)} inputMode="decimal" />
                <button onClick={() => setQty(p.ID_Producto, p.qty + 1)}>+</button>
              </div>
              <b style={{ minWidth: 80, textAlign: 'right' }}>{money(p.qty * Number(p.Precio_Venta))}</b>
            </div>))}
          {!items.length && <p className="muted" style={{ padding: 8 }}>No quedan productos.</p>}
        </div>

        <div className="formgrid">
          <label className="f full">Cliente
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select className="input" value={f.ID_Cliente} onChange={(e) => set('ID_Cliente', e.target.value)}>
                <option value="">Cliente general (sin registrar)</option>
                {clientes.map((c) => <option key={c.ID_Cliente} value={c.ID_Cliente}>{c.Nombre}{c.Telefono ? ' · ' + c.Telefono : ''}</option>)}
              </select>
              {can('Clientes', 'Crear') && <button type="button" className="btn" onClick={() => setNewCli({ Nombre: '', Telefono: '', Direccion: '' })}><Icon n="plus" />Nuevo</button>}
            </div>
          </label>
          <label className="f">Entrega
            <select className="input" value={f.tipoEntrega} onChange={(e) => set('tipoEntrega', e.target.value)}>
              <option>Retiro en local</option>{can('Delivery', 'Crear') && <option>Delivery</option>}
            </select>
          </label>
          <label className="f">Descuento<input className="input" type="number" min="0" inputMode="decimal" value={f.descuento} onChange={(e) => set('descuento', e.target.value)} /></label>
        </div>

        {f.tipoEntrega === 'Delivery' && (
          <div className="card stack" style={{ background: 'var(--accent-soft)' }}>
            <h3>Datos del delivery</h3>
            <div className="formgrid">
              <label className="f">Repartidor *
                <select className="input" value={f.ID_Delivery} onChange={(e) => set('ID_Delivery', e.target.value)}>
                  <option value="">Selecciona…</option>{deliverys.map((d) => <option key={d.ID_Delivery} value={d.ID_Delivery}>{d.Nombre}</option>)}
                </select>
              </label>
              <label className="f full">Dirección de entrega<input className="input" value={f.Direccion_Entrega} onChange={(e) => set('Direccion_Entrega', e.target.value)} /></label>
              <label className="f">Distancia (km)<input className="input" type="number" step="any" inputMode="decimal" value={f.Distancia_Km} onChange={(e) => set('Distancia_Km', e.target.value)} /></label>
              <label className="f">Monto delivery<input className="input" type="number" min="0" inputMode="decimal" value={f.Monto_Delivery} onChange={(e) => set('Monto_Delivery', e.target.value)} /></label>
              <label className="f full">Notas para el repartidor<input className="input" value={f.Notas} onChange={(e) => set('Notas', e.target.value)} /></label>
            </div>
            {f.Direccion_Entrega && <a className="small" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(f.Direccion_Entrega)}>Ver ruta en Google Maps (para estimar km y tiempo)</a>}
          </div>)}

        <div className="formgrid">
          <label className="f">Método de pago
            <select className="input" value={f.metodoPago} onChange={(e) => set('metodoPago', e.target.value)}>{['Efectivo', 'Tarjeta', 'Transferencia', 'Mixto'].map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="f">Estado del pago
            <select className="input" value={f.estadoPago} onChange={(e) => set('estadoPago', e.target.value)}>{['Pagado', 'Pendiente', 'Parcial'].map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="f">Documento
            <select className="input" value={f.tipoDocumento} onChange={(e) => set('tipoDocumento', e.target.value)}>{['Ticket', 'Boleta', 'Factura'].map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="f">Formato de impresión
            <select className="input" value={f.formato} onChange={(e) => set('formato', e.target.value)}>{['Termica 58mm', 'Termica 80mm', 'A4 Carta'].map((o) => <option key={o}>{o}</option>)}</select></label>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}><span>Subtotal</span><b>{money(subtotal)}</b></div>
          {desc > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Descuento</span><b>-{money(desc)}</b></div>}
          {envio > 0 && <div className="row" style={{ justifyContent: 'space-between' }}><span>Delivery</span><b>{money(envio)}</b></div>}
          <div className="row" style={{ justifyContent: 'space-between', fontSize: '1.3rem' }}><span>Total</span><b>{money(total)}</b></div>
        </div>
        {err && <div className="alert">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Seguir agregando</button>
          <button className="btn primary" disabled={busy || !items.length} onClick={confirm}>{busy ? 'Registrando…' : 'Confirmar venta'}</button>
        </div>
      </div>

      {newCli && (
        <Modal title="Nuevo cliente" onClose={() => setNewCli(null)}>
          <form className="stack" onSubmit={saveClient}>
            <label className="f">Nombre *<input className="input" required value={newCli.Nombre} onChange={(e) => setNewCli({ ...newCli, Nombre: e.target.value })} /></label>
            <label className="f">Teléfono<input className="input" value={newCli.Telefono} onChange={(e) => setNewCli({ ...newCli, Telefono: e.target.value })} /></label>
            <label className="f">Dirección<input className="input" value={newCli.Direccion} onChange={(e) => setNewCli({ ...newCli, Direccion: e.target.value })} /></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setNewCli(null)}>Cancelar</button><button className="btn primary">Guardar cliente</button></div>
          </form>
        </Modal>)}
    </Modal>
  );
}
