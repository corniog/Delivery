import { useEffect, useMemo, useState } from 'react';
import { call, listar } from '../api.js';
import { Modal, useFmt, useToast } from '../ui.jsx';
import { esPreparado, opcionesUnidad, unidadInicial, aUnidadInventario } from '../recetas.js';

// Receta de un producto preparado: ingredientes (del inventario), cantidad de cada uno y costo.
export default function RecetaModal({ producto, onClose, onSaved }) {
  const { money } = useFmt();
  const toast = useToast();
  const [prods, setProds] = useState(null);
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listar('Productos'), listar('Receta_Ingredientes')]).then(([p, r]) => {
      const byId = Object.fromEntries(p.map((x) => [x.ID_Producto, x]));
      setProds(p);
      setLines(r.filter((x) => x.ID_Producto === producto.ID_Producto && byId[x.ID_Ingrediente]).map((x) => {
        const ing = byId[x.ID_Ingrediente];
        const opts = opcionesUnidad(ing.Unidad_Medida);
        const u = opts.includes(x.Unidad_Receta) ? x.Unidad_Receta : unidadInicial(ing.Unidad_Medida);
        const cant = opts.includes(x.Unidad_Receta) && Number(x.Cantidad_Receta) > 0 ? Number(x.Cantidad_Receta) : Number(x.Cantidad);
        return { ID_Ingrediente: x.ID_Ingrediente, cant: String(cant), unidad: u };
      }));
    }).catch((e) => { toast(e.message, true); setProds([]); });
  }, [producto.ID_Producto, toast]);

  const byId = useMemo(() => Object.fromEntries((prods || []).map((x) => [x.ID_Producto, x])), [prods]);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    const usados = new Set(lines.map((l) => l.ID_Ingrediente));
    return (prods || []).filter((x) => !esPreparado(x) && String(x.Activo).toUpperCase() !== 'FALSE' && x.ID_Producto !== producto.ID_Producto && !usados.has(x.ID_Producto)
      && (!s || [x.Nombre, x.SKU, x.Codigo_Barras].some((v) => String(v || '').toLowerCase().includes(s)))).slice(0, 8);
  }, [q, prods, lines, producto.ID_Producto]);

  const add = (p) => { setLines((ls) => [...ls, { ID_Ingrediente: p.ID_Producto, cant: '', unidad: unidadInicial(p.Unidad_Medida) }]); setQ(''); };
  const upd = (id, k, v) => setLines((ls) => ls.map((l) => (l.ID_Ingrediente === id ? { ...l, [k]: v } : l)));
  const calc = (l) => {
    const ing = byId[l.ID_Ingrediente] || {};
    const inv = aUnidadInventario(l.cant, l.unidad, ing.Unidad_Medida);
    return { inv, costo: inv * (Number(ing.Precio_Compra) || 0), ing };
  };
  const costo = lines.reduce((s, l) => s + calc(l).costo, 0);
  const venta = Number(producto.Precio_Venta) || 0;
  const margen = venta - costo;

  const save = async () => {
    if (!lines.length) { toast('Agrega al menos un ingrediente', true); return; }
    if (lines.some((l) => !(Number(l.cant) > 0))) { toast('Escribe la cantidad de cada ingrediente', true); return; }
    setBusy(true);
    try {
      await call('guardarReceta', {
        ID_Producto: producto.ID_Producto,
        ingredientes: lines.map((l) => ({ ID_Ingrediente: l.ID_Ingrediente, Cantidad: calc(l).inv, Cantidad_Receta: Number(l.cant), Unidad_Receta: l.unidad }))
      });
      toast('Receta guardada');
      onSaved && onSaved();
      onClose();
    } catch (e) { toast(e.message, true); setBusy(false); }
  };

  return (
    <Modal title={'Receta: ' + producto.Nombre} onClose={onClose} wide>
      <div className="stack">
        <p className="muted small">Agrega los ingredientes que se usan para <b>1</b> {producto.Nombre}. Al vender, el sistema descuenta estos ingredientes del inventario (el producto en sí no lleva stock).</p>
        {prods === null ? <p className="muted">Cargando…</p> : (
          <>
            <input className="input" placeholder="Buscar ingrediente en el inventario (pan, carne, queso…)" value={q} onChange={(e) => setQ(e.target.value)} />
            {(q.trim() || !lines.length) && found.map((p) => (
              <button key={p.ID_Producto} type="button" className="prow" onClick={() => add(p)}>
                <b className="grow" style={{ textAlign: 'left' }}>{p.Nombre}</b>
                <span className="muted small">{p.Unidad_Medida} · costo {money(p.Precio_Compra)} · stock {Number(p.Stock_Actual)}</span>
              </button>))}
            {!!lines.length && (
              <table className="t">
                <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th className="right">Costo</th><th /></tr></thead>
                <tbody>{lines.map((l) => {
                  const c = calc(l);
                  const opts = opcionesUnidad(c.ing.Unidad_Medida);
                  return (
                    <tr key={l.ID_Ingrediente}>
                      <td data-label="Ingrediente"><b>{c.ing.Nombre}</b>
                        <div className="muted small">{money(c.ing.Precio_Compra)} por {c.ing.Unidad_Medida}{!(Number(c.ing.Precio_Compra) > 0) && <span className="badge warn"> sin costo</span>}</div></td>
                      <td data-label="Cantidad"><input className="input" type="number" min="0" step="any" inputMode="decimal" style={{ width: 100 }} value={l.cant} onChange={(e) => upd(l.ID_Ingrediente, 'cant', e.target.value)} /></td>
                      <td data-label="Unidad">{opts.length > 1
                        ? <select className="input" style={{ width: 90 }} value={l.unidad} onChange={(e) => upd(l.ID_Ingrediente, 'unidad', e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
                        : <span>{opts[0]}</span>}</td>
                      <td data-label="Costo" className="right">{money(c.costo)}</td>
                      <td><button type="button" className="btn sm danger" aria-label="Quitar" onClick={() => setLines(lines.filter((x) => x !== l))}>✕</button></td>
                    </tr>);
                })}</tbody>
                <tfoot><tr><td colSpan={3}>Costo de 1 {producto.Nombre}</td><td className="right">{money(costo)}</td><td /></tr></tfoot>
              </table>)}
            {!!lines.length && (
              <div className="muted small">
                Precio de venta {money(venta)} · ganancia por unidad <b>{money(margen)}</b>{venta > 0 && ` (${Math.round((margen / venta) * 100)}%)`}
              </div>)}
          </>)}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" disabled={busy || prods === null} onClick={save}>{busy ? 'Guardando…' : 'Guardar receta'}</button>
        </div>
      </div>
    </Modal>
  );
}
