import { useEffect, useMemo, useState, useCallback } from 'react';
import { call, listar } from './api.js';
import { useAuth } from './auth.jsx';
import { Modal, Confirm, FileInput, Scanner, Icon, useToast, fdate } from './ui.jsx';

// Hook para cargar una tabla
export function useTable(tabla) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setRows(await listar(tabla)); setErr(''); } catch (e) { setErr(e.message); setRows([]); }
  }, [tabla]);
  useEffect(() => { load(); }, [load]);
  return { rows, err, reload: load };
}

function FieldInput({ f, value, onChange, refs, module }) {
  const v = value ?? '';
  switch (f.type) {
    case 'textarea': return <textarea className="input" rows={3} value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'number': return <input className="input" type="number" step="any" inputMode="decimal" value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'date': return <input className="input" type="date" value={String(v).slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
    case 'bool': return <label className="chk"><input type="checkbox" checked={v === true || String(v).toUpperCase() === 'TRUE'} onChange={(e) => onChange(e.target.checked)} /> Sí</label>;
    case 'select': return (
      <select className="input" value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>{(f.options || []).map((o) => <option key={o}>{o}</option>)}
      </select>);
    case 'ref': {
      const list = refs[f.ref] || [];
      return (
        <select className="input" value={v} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>{list.map((r) => <option key={r[f.refKey]} value={r[f.refKey]}>{r[f.refLabel || 'Nombre']}</option>)}
        </select>);
    }
    case 'multi': {
      const cur = String(v).split(',').map((s) => s.trim()).filter(Boolean);
      return (
        <div className="row">{f.options.map((o) => (
          <label key={o} className="chk"><input type="checkbox" checked={cur.includes(o)} onChange={(e) => onChange((e.target.checked ? [...cur, o] : cur.filter((x) => x !== o)).join(', '))} />{o}</label>
        ))}</div>);
    }
    case 'image': return <FileInput value={v} onChange={onChange} modulo={module} />;
    case 'pdf': return <FileInput value={v} onChange={onChange} modulo={module} accept="application/pdf" label="Subir PDF" />;
    case 'barcode': return <BarcodeField value={v} onChange={onChange} />;
    default: return <input className="input" type="text" value={v} onChange={(e) => onChange(e.target.value)} />;
  }
}

function BarcodeField({ value, onChange }) {
  const [scan, setScan] = useState(false);
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Escanea o escribe" inputMode="numeric" />
      <button type="button" className="btn" onClick={() => setScan(true)} aria-label="Escanear"><Icon n="scan" /></button>
      {scan && <Scanner onClose={() => setScan(false)} onCode={(c) => { onChange(c); setScan(false); }} />}
    </div>
  );
}

export function RecordForm({ title, fields, initial, refs, module, onSave, onClose, editing }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const visible = fields.filter((f) => !(f.onlyCreate && editing) && !f.hideForm);
  const submit = async (e) => {
    e.preventDefault();
    for (const f of visible) if (f.required && (data[f.key] === undefined || data[f.key] === '')) { setErr(`Falta: ${f.label}`); return; }
    setBusy(true); setErr('');
    try { await onSave(data); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="formgrid">
          {visible.map((f) => (
            <label key={f.key} className={'f' + (['textarea', 'multi', 'image', 'pdf'].includes(f.type) ? ' full' : '')}>
              {f.label}{f.required ? ' *' : ''}
              <FieldInput f={f} value={data[f.key]} refs={refs} module={module} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} />
            </label>
          ))}
        </div>
        {err && <div className="alert">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Pantalla genérica de lista + crear/editar/eliminar con permisos.
 * props: title, tabla, module, idKey, fields, columns, searchKeys, defaults, extraActions(row, reload), filterRef, rowClass, headExtra
 */
export default function Crud({ title, tabla, module, idKey, fields, columns, searchKeys = [], defaults = {}, extraActions, filterRef, rowClass, headExtra, newLabel = 'Nuevo', hideTitle }) {
  const { can } = useAuth();
  const toast = useToast();
  const { rows, err, reload } = useTable(tabla);
  const [refs, setRefs] = useState({});
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('');
  const [edit, setEdit] = useState(null); // {row?}
  const [del, setDel] = useState(null);

  useEffect(() => {
    const need = [...new Set(fields.filter((f) => f.type === 'ref').map((f) => f.ref).concat(filterRef ? [filterRef.ref] : []))];
    Promise.all(need.map(async (t) => [t, await listar(t).catch(() => [])])).then((a) => setRefs(Object.fromEntries(a)));
  }, []); // eslint-disable-line

  const shown = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!flt || String(r[filterRef.key]) === flt) && (!s || searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(s))));
  }, [rows, q, flt, searchKeys, filterRef]);

  const label = (col, r) => {
    if (col.render) return col.render(r, refs);
    const v = r[col.key];
    if (col.type === 'image') return v ? <img className="thumb" src={v} alt="" /> : <div className="thumb" />;
    if (col.type === 'bool') return String(v).toUpperCase() === 'TRUE' ? <span className="badge ok">Sí</span> : <span className="badge bad">No</span>;
    if (col.type === 'ref') { const x = (refs[col.ref] || []).find((o) => String(o[col.refKey]) === String(v)); return x ? x[col.refLabel || 'Nombre'] : v; }
    if (col.type === 'date') return fdate(v);
    if (col.type === 'money') return col.money ? col.money(v) : v;
    return v === undefined || v === null ? '' : String(v);
  };

  const save = async (data) => {
    if (edit.row) await call('actualizar', { tabla, id: edit.row[idKey], datos: data });
    else await call('crear', { tabla, datos: data });
    toast('Guardado');
    setEdit(null); reload();
  };
  const remove = async () => {
    try { await call('eliminar', { tabla, id: del[idKey] }); toast('Eliminado'); } catch (e) { toast(e.message, true); }
    setDel(null); reload();
  };

  return (
    <div className="stack">
      <div className="pagehead">
        {!hideTitle && <h1>{title}</h1>}
        {headExtra}
        {can(module, 'Crear') && <button className="btn primary" onClick={() => setEdit({ row: null })}><Icon n="plus" />{newLabel}</button>}
      </div>
      <div className="row">
        <input className="input" style={{ maxWidth: 360 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        {filterRef && (
          <select className="input" style={{ maxWidth: 240 }} value={flt} onChange={(e) => setFlt(e.target.value)}>
            <option value="">{filterRef.label}: todas</option>
            {(refs[filterRef.ref] || []).map((r) => <option key={r[filterRef.refKey]} value={r[filterRef.refKey]}>{r[filterRef.refLabel || 'Nombre']}</option>)}
          </select>)}
        <span className="muted small">{shown.length} registro(s)</span>
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card" style={{ padding: 6 }}>
        {rows === null ? <p className="muted" style={{ padding: 12 }}>Cargando…</p> : !shown.length ? <p className="muted" style={{ padding: 12 }}>No hay registros.</p> : (
          <table className="t">
            <thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r[idKey]} className={rowClass ? rowClass(r) : ''}>
                  {columns.map((c) => <td key={c.label} data-label={c.label}>{label(c, r)}</td>)}
                  <td className="actions"><div className="row" style={{ justifyContent: 'flex-end' }}>
                    {extraActions && extraActions(r, reload)}
                    {can(module, 'Editar') && <button className="btn sm" onClick={() => setEdit({ row: r })}>Editar</button>}
                    {can(module, 'Eliminar') && <button className="btn sm danger" onClick={() => setDel(r)}>Eliminar</button>}
                  </div></td>
                </tr>))}
            </tbody>
          </table>)}
      </div>
      {edit && <RecordForm title={(edit.row ? 'Editar ' : 'Nuevo ') + title.toLowerCase()} fields={fields} initial={edit.row ? { ...edit.row } : { ...defaults }} refs={refs} module={module} editing={!!edit.row} onSave={save} onClose={() => setEdit(null)} />}
      {del && <Confirm text={`¿Eliminar "${del.Nombre || del[idKey]}"? Esta acción no se puede deshacer.`} onYes={remove} onNo={() => setDel(null)} />}
    </div>
  );
}
