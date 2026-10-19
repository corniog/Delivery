import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Modal, useToast } from '../ui.jsx';
import { getImpresoras, setImpresoras, hayDirecta, esNativa, listar, enviar, PLANTILLAS, TIPOS } from '../impresoras.js';
import { prueba } from '../escpos.js';

const vacia = () => ({ id: 'P' + Date.now().toString(36), nombre: '', tipo: 'usb', direccion: '', etiqueta: '', roles: ['comprobante'], activa: true, ...PLANTILLAS.usb });

// Impresoras de ESTE dispositivo: se guardan en la APK y se usan sin diálogos (como Loyverse).
export default function Impresoras() {
  const { cocina } = useAuth();
  const toast = useToast();
  const [lista, setLista] = useState(getImpresoras());
  const [f, setF] = useState(null);
  const [disp, setDisp] = useState(null);
  const [busy, setBusy] = useState(false);
  const guardar = (l) => { setImpresoras(l); setLista(l); };

  if (!esNativa()) {
    return (
      <div className="muted small">
        Las impresoras guardadas funcionan en la <b>app Android (APK)</b>: ahí se conectan por Bluetooth, USB o red y imprimen sin diálogos, con corte automático.
        Desde el navegador se usa el diálogo de impresión del equipo.
      </div>);
  }
  if (!hayDirecta()) return <div className="alert">Esta APK no incluye la impresión directa. Genera e instala la APK más reciente (Actions → Crear APK).</div>;

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const cambiaTipo = (tipo) => { setDisp(null); setF((x) => ({ ...x, tipo, direccion: '', etiqueta: '', ...PLANTILLAS[tipo] })); };
  const buscar = async () => {
    setBusy(true);
    try { setDisp(await listar(f.tipo)); } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const probar = async (p) => {
    setBusy(true);
    try { await enviar(p, prueba(p, p.nombre)); toast('Prueba enviada a ' + (p.nombre || 'la impresora')); } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const ok = () => {
    if (!f.nombre.trim()) return toast('Ponle un nombre a la impresora', true);
    if (!f.direccion.trim()) return toast(f.tipo === 'red' ? 'Escribe la dirección IP de la impresora' : 'Elige el dispositivo de la lista', true);
    if (!f.roles.length) return toast('Marca qué imprime esta impresora', true);
    const i = lista.findIndex((x) => x.id === f.id);
    guardar(i >= 0 ? lista.map((x) => (x.id === f.id ? f : x)) : [...lista, f]);
    setF(null);
  };
  const rol = (r, on) => set('roles', on ? [...new Set([...f.roles, r])] : f.roles.filter((x) => x !== r));

  return (
    <div className="stack">
      {!lista.length && <p className="muted small" style={{ margin: 0 }}>Aún no hay impresoras en este dispositivo. Agrega la de comprobantes{cocina ? ' y la de la cocina' : ''}.</p>}
      {lista.map((p) => (
        <div key={p.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
          <div className="grow">
            <b>{p.nombre}</b> <span className="muted small">· {TIPOS[p.tipo]} · {p.papel} mm{p.corte ? ' · con corte' : ''}</span>
            <div className="small muted">{p.etiqueta || p.direccion} — {(p.roles || []).map((r) => (r === 'comanda' ? 'Comandas' : 'Comprobantes')).join(' y ')}</div>
          </div>
          <button className="btn sm" disabled={busy} onClick={() => probar(p)}>Probar</button>
          <button className="btn sm" onClick={() => { setDisp(null); setF({ ...p }); }}>Editar</button>
          <button className="btn sm danger" onClick={() => guardar(lista.filter((x) => x.id !== p.id))}>Quitar</button>
        </div>))}
      <div><button className="btn" onClick={() => { setDisp(null); setF(vacia()); }}>+ Agregar impresora</button></div>

      {f && (
        <Modal title={lista.some((x) => x.id === f.id) ? 'Editar impresora' : 'Nueva impresora'} onClose={() => setF(null)}>
          <div className="stack">
            <label className="f">Nombre<input className="input" placeholder="Ej: Caja, Cocina" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></label>
            <label className="f">Conexión
              <select className="input" value={f.tipo} onChange={(e) => cambiaTipo(e.target.value)}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {f.tipo === 'red' ? (
              <label className="f">Dirección IP de la impresora<input className="input" inputMode="decimal" placeholder="192.168.1.50" value={f.direccion} onChange={(e) => set('direccion', e.target.value)} /></label>
            ) : (
              <div className="stack">
                <div className="row"><button className="btn" disabled={busy} onClick={buscar}>{busy ? 'Buscando…' : f.tipo === 'usb' ? 'Buscar impresoras USB' : 'Buscar impresoras Bluetooth'}</button>
                  {f.etiqueta && <span className="small">Elegida: <b>{f.etiqueta}</b></span>}</div>
                {f.tipo === 'bluetooth' && <p className="muted small" style={{ margin: 0 }}>La impresora debe estar encendida y vinculada antes en Ajustes → Bluetooth del teléfono.</p>}
                {f.tipo === 'usb' && <p className="muted small" style={{ margin: 0 }}>Conéctala con cable USB (adaptador OTG si hace falta). Android pedirá permiso: acepta y marca «usar siempre».</p>}
                {disp && !disp.length && <p className="muted small" style={{ margin: 0 }}>No se encontró ninguna. {f.tipo === 'bluetooth' ? 'Vincúlala primero en Ajustes → Bluetooth.' : 'Revisa el cable.'}</p>}
                {disp && disp.map((d) => (
                  <button key={d.direccion} className={'btn' + (f.direccion === d.direccion ? ' primary' : '')} onClick={() => setF((x) => ({ ...x, direccion: d.direccion, etiqueta: d.nombre, nombre: x.nombre || d.nombre }))}>
                    {d.nombre}{d.impresora === false ? ' (no parece impresora)' : ''}</button>))}
              </div>)}
            <div className="formgrid">
              <label className="f">Ancho del papel
                <select className="input" value={f.papel} onChange={(e) => set('papel', e.target.value)}><option value="58">58 mm</option><option value="80">80 mm</option></select></label>
              <label className="f">Espacio al final (mm)
                <input className="input" type="number" min="0" max="60" value={f.avance} onChange={(e) => set('avance', e.target.value)} /></label>
            </div>
            <div className="stack">
              <b className="small">¿Qué imprime?</b>
              <label className="chk"><input type="checkbox" checked={f.roles.includes('comprobante')} onChange={(e) => rol('comprobante', e.target.checked)} />Comprobantes (boleta, factura, ticket)</label>
              {cocina && <label className="chk"><input type="checkbox" checked={f.roles.includes('comanda')} onChange={(e) => rol('comanda', e.target.checked)} />Comandas de cocina</label>}
              <label className="chk"><input type="checkbox" checked={!!f.corte} onChange={(e) => set('corte', e.target.checked)} />Tiene cortador automático</label>
              <label className="chk"><input type="checkbox" checked={!!f.tildes} onChange={(e) => set('tildes', e.target.checked)} />Imprimir tildes y ñ (si salen símbolos raros, desmárcalo)</label>
            </div>
            {!f.corte && <p className="muted small" style={{ margin: 0 }}>Sin cortador: el papel avanza {f.avance || 0} mm al final para que el ticket salga completo y puedas rasgarlo. Súbelo si queda pegado.</p>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" disabled={busy || !f.direccion} onClick={() => probar(f)}>Impresión de prueba</button>
              <button className="btn primary" onClick={ok}>Guardar</button>
            </div>
          </div>
        </Modal>)}
    </div>
  );
}
