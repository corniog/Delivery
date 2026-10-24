import { useEffect, useState, useCallback, useMemo } from 'react';
import { call, listar } from '../api.js';
import { useAuth } from '../auth.jsx';
import { esPreparado } from '../recetas.js';
import { mensajeCompra, asuntoCompra, linkWhatsApp, linkCorreo, compartirPdf, telefonoWa } from '../compartir.js';
import { Icon, Modal, Confirm, Scanner, useFmt, useToast, fdt, today, daysAgo } from '../ui.jsx';

const cls = { Recibida: 'ok', Pendiente: 'warn', Anulada: 'bad' };

export default function Compras() {
  const { can, config } = useAuth();
  const { money } = useFmt();
  const toast = useToast();
  const [provs, setProvs] = useState([]);
  const [f, setF] = useState({ desde: daysAgo(30), hasta: today(), estado: '' });
  const [r, setR] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [open, setOpen] = useState(null);
  const [anular, setAnular] = useState(null);
  const load = useCallback(async () => {
    try { setR(await call('listarCompras', { desde: f.desde, hasta: f.hasta, estado: f.estado })); } catch (e) { toast(e.message, true); setR({ rows: [], total: 0, cantidad: 0 }); }
  }, [f.desde, f.hasta, f.estado, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listar('Proveedores').then(setProvs).catch(() => {}); }, []);

  const recibir = async (c) => {
    try { await call('recibirCompra', { ID_Compra: c.ID_Compra }); toast('Compra recibida: stock actualizado'); setOpen(null); load(); } catch (e) { toast(e.message, true); }
  };
  const doAnular = async () => {
    try { await call('anularCompra', { ID_Compra: anular.ID_Compra, motivo: 'Anulada desde compras' }); toast('Compra anulada'); } catch (e) { toast(e.message, true); }
    setAnular(null); setOpen(null); load();
  };

  return (
    <div className="stack">
      <div className="pagehead">
        <h1>Compras a proveedores</h1>
        {can('Proveedores', 'Crear') && <button className="btn primary" onClick={() => setNueva(true)}><Icon n="plus" />Nueva compra</button>}
      </div>
      <div className="row">
        <label className="row small muted">Desde <input className="input" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
        <label className="row small muted">Hasta <input className="input" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
        <select className="input" style={{ maxWidth: 170 }} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
          <option value="">Todos los estados</option><option>Recibida</option><option>Pendiente</option><option>Anulada</option>
        </select>
      </div>
      <div className="card" style={{ padding: 6 }}>
        {!r ? <p className="muted" style={{ padding: 12 }}>Cargando…</p> : !r.rows.length ? <p className="muted" style={{ padding: 12 }}>No hay compras en este filtro.</p> : (
          <table className="t">
            <thead><tr><th>Compra</th><th>Fecha</th><th>Proveedor</th><th>Productos</th><th>Estado</th><th className="right">Total</th></tr></thead>
            <tbody>{r.rows.map((c) => (
              <tr key={c.ID_Compra} onClick={() => setOpen(c)} style={{ cursor: 'pointer', opacity: c.Estado === 'Anulada' ? 0.5 : 1 }}>
                <td data-label="Compra"><b>{c.ID_Compra}</b></td><td data-label="Fecha">{fdt(c.Fecha)}</td><td data-label="Proveedor">{c.Proveedor || '—'}</td>
                <td data-label="Productos">{c.items.length}</td>
                <td data-label="Estado"><span className={'badge ' + (cls[c.Estado] || '')}>{c.Estado}</span></td>
                <td data-label="Total" className="right">{money(c.Total)}</td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={5}>Total comprado ({r.cantidad} compras válidas)</td><td className="right">{money(r.total)}</td></tr></tfoot>
          </table>)}
      </div>

      {open && (
        <Modal title={'Compra ' + open.ID_Compra} onClose={() => setOpen(null)} wide>
          <div className="stack">
            <div className="row"><b className="grow">{open.Proveedor}</b><span className={'badge ' + (cls[open.Estado] || '')}>{open.Estado}</span></div>
            <div className="muted small">{fdt(open.Fecha)} · {open.Usuario}{open.Nota ? ' · ' + open.Nota : ''}</div>
            <table className="t">
              <thead><tr><th>Producto</th><th className="right">Cant.</th><th className="right">Costo</th><th className="right">Subtotal</th></tr></thead>
              <tbody>{open.items.map((i, k) => (
                <tr key={k}><td data-label="Producto">{i.Nombre}</td><td data-label="Cant." className="right">{i.Cantidad}</td>
                  <td data-label="Costo" className="right">{money(i.Costo_Unitario)}</td><td data-label="Subtotal" className="right">{money(i.Subtotal)}</td></tr>))}</tbody>
              <tfoot><tr><td colSpan={3}>Total</td><td className="right">{money(open.Total)}</td></tr></tfoot>
            </table>
            {open.Estado !== 'Anulada' && <Compartir compra={compraCon(open, provs)} negocio={config.NOMBRE_NEGOCIO} />}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {open.Estado === 'Pendiente' && can('Proveedores', 'Editar') && <button className="btn ok" onClick={() => recibir(open)}>Marcar como recibida</button>}
              {open.Estado !== 'Anulada' && can('Proveedores', 'Eliminar') && <button className="btn danger" onClick={() => setAnular(open)}>Anular</button>}
            </div>
          </div>
        </Modal>)}
      {anular && <Confirm yesText="Anular" text={`¿Anular la compra ${anular.ID_Compra}? ${anular.Estado === 'Recibida' ? 'Se descontará del stock lo que ingresó.' : ''}`} onYes={doAnular} onNo={() => setAnular(null)} />}
      {nueva && <NuevaCompra onClose={() => setNueva(false)} onDone={() => { setNueva(false); load(); }} />}
    </div>
  );
}

const compraCon = (c, provs) => {
  const p = provs.find((x) => x.ID_Proveedor === c.ID_Proveedor) || {};
  return { ...c, TelefonoProveedor: p.Telefono || '', EmailProveedor: p.Email || '' };
};

// Enviar la solicitud al proveedor: WhatsApp (wa.me), correo del teléfono, o PDF compartido.
function Compartir({ compra, negocio }) {
  const { money } = useFmt();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const texto = mensajeCompra(compra, negocio, money);
  const asunto = asuntoCompra(compra, negocio);
  const pdf = async () => {
    setBusy(true);
    try {
      const r = await compartirPdf(compra, negocio, money, texto);
      if (r === 'descargado') toast('PDF descargado. Adjúntalo en WhatsApp o en tu correo.');
    } catch (e) { toast('No se pudo crear el PDF: ' + e.message, true); }
    setBusy(false);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="muted small">Enviar solicitud al proveedor</div>
      <div className="row">
        <a className="btn ok" href={linkWhatsApp(compra, texto)} target="_blank" rel="noreferrer"
          onClick={() => { if (!telefonoWa(compra.TelefonoProveedor)) toast('El proveedor no tiene teléfono: elige el contacto en WhatsApp'); }}>WhatsApp</a>
        <a className="btn" href={linkCorreo(compra, asunto, texto)}
          onClick={() => { if (!compra.EmailProveedor) toast('El proveedor no tiene correo: escríbelo en tu app de correo'); }}>Correo</a>
        <button className="btn primary" disabled={busy} onClick={pdf}>{busy ? 'Creando PDF…' : 'Compartir ticket PDF'}</button>
      </div>
      <div className="muted small">WhatsApp y Correo abren la app con el mensaje listo. «Compartir ticket PDF» abre el menú del teléfono para enviar el PDF con el mensaje por WhatsApp, correo u otra app.</div>
    </div>
  );
}

function NuevaCompra({ onClose, onDone }) {
  const { money } = useFmt();
  const toast = useToast();
  const [provs, setProvs] = useState([]);
  const [prods, setProds] = useState([]);
  const [prov, setProv] = useState('');
  const [nota, setNota] = useState('');
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [recibir, setRecibir] = useState(true);
  const [costo, setCosto] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listar('Proveedores').then(setProvs).catch((e) => toast(e.message, true));
    listar('Productos').then((p) => setProds(p.filter((x) => String(x.Activo).toUpperCase() !== 'FALSE' && !esPreparado(x)))).catch((e) => toast(e.message, true));
  }, [toast]);

  const add = (p) => setLines((ls) => ls.find((l) => l.ID_Producto === p.ID_Producto) ? ls
    : [...ls, { ID_Producto: p.ID_Producto, Nombre: p.Nombre, Cantidad: 1, Costo_Unitario: Number(p.Precio_Compra) || 0 }]);
  const upd = (id, k, v) => setLines((ls) => ls.map((l) => (l.ID_Producto === id ? { ...l, [k]: v } : l)));
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return prods.filter((p) => [p.Nombre, p.Codigo_Barras, p.SKU].some((x) => String(x || '').toLowerCase().includes(s))).slice(0, 6);
  }, [q, prods]);
  const total = lines.reduce((a, l) => a + (Number(l.Cantidad) || 0) * (Number(l.Costo_Unitario) || 0), 0);
  const onCode = (code) => {
    setScan(false);
    const p = prods.find((x) => String(x.Codigo_Barras) === String(code));
    if (p) { add(p); toast(p.Nombre + ' agregado'); } else toast('No hay un producto con ese código', true);
  };
  const save = async () => {
    setBusy(true);
    try {
      await call('crearCompra', { ID_Proveedor: prov, nota, recibir, actualizarCosto: costo,
        items: lines.map((l) => ({ ID_Producto: l.ID_Producto, Cantidad: Number(l.Cantidad), Costo_Unitario: Number(l.Costo_Unitario) })) });
      toast(recibir ? 'Compra registrada: stock actualizado' : 'Compra guardada como pendiente');
      onDone();
    } catch (e) { toast(e.message, true); setBusy(false); }
  };
  return (
    <Modal title="Nueva compra" onClose={onClose} wide>
      <div className="stack">
        <div className="formgrid">
          <label>Proveedor
            <select className="input" value={prov} onChange={(e) => setProv(e.target.value)}>
              <option value="">— Elegir —</option>{provs.map((p) => <option key={p.ID_Proveedor} value={p.ID_Proveedor}>{p.Nombre}</option>)}
            </select></label>
          <label>Nota (N° factura, etc.)<input className="input" value={nota} onChange={(e) => setNota(e.target.value)} /></label>
        </div>
        <div className="row">
          <input className="input grow" placeholder="Buscar producto por nombre, SKU o código…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" onClick={() => setScan(true)}><Icon n="scan" />Escanear</button>
        </div>
        {found.map((p) => (
          <button key={p.ID_Producto} className="prow" onClick={() => { add(p); setQ(''); }}>
            <b className="grow" style={{ textAlign: 'left' }}>{p.Nombre}</b><span className="muted small">Stock {p.Stock_Actual} · costo {money(p.Precio_Compra)}</span>
          </button>))}
        {!!lines.length && (
          <table className="t">
            <thead><tr><th>Producto</th><th>Cantidad</th><th>Costo unit.</th><th className="right">Subtotal</th><th /></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.ID_Producto}>
                <td data-label="Producto">{l.Nombre}</td>
                <td data-label="Cantidad"><input className="input" type="number" min="0" step="any" style={{ width: 90 }} value={l.Cantidad} onChange={(e) => upd(l.ID_Producto, 'Cantidad', e.target.value)} /></td>
                <td data-label="Costo unit."><input className="input" type="number" min="0" step="any" style={{ width: 110 }} value={l.Costo_Unitario} onChange={(e) => upd(l.ID_Producto, 'Costo_Unitario', e.target.value)} /></td>
                <td data-label="Subtotal" className="right">{money((Number(l.Cantidad) || 0) * (Number(l.Costo_Unitario) || 0))}</td>
                <td><button className="btn sm danger" onClick={() => setLines(lines.filter((x) => x !== l))} aria-label="Quitar">✕</button></td>
              </tr>))}</tbody>
            <tfoot><tr><td colSpan={3}>Total</td><td className="right">{money(total)}</td><td /></tr></tfoot>
          </table>)}
        <label className="row"><input type="checkbox" checked={recibir} onChange={(e) => setRecibir(e.target.checked)} /> Ya la recibí: sumar al stock ahora</label>
        <label className="row"><input type="checkbox" checked={costo} onChange={(e) => setCosto(e.target.checked)} /> Actualizar el costo de compra de los productos</label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy || !prov || !lines.length} onClick={save}>{busy ? 'Guardando…' : 'Registrar compra'}</button>
        </div>
      </div>
      {scan && <Scanner onCode={onCode} onClose={() => setScan(false)} />}
    </Modal>
  );
}
