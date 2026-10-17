import { useEffect, useState, useCallback } from 'react';
import { call, listar } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, FileInput, useToast, Icon, fdt, Confirm } from '../ui.jsx';
import Crud, { useTable } from '../Crud.jsx';
import { Unidades } from './Simple.jsx';
import { SubscriptionCard } from '../Suscripcion.jsx';

const MODS = [['Inventario', 'Inventario'], ['Categorias', 'Categorías'], ['Ventas', 'Ventas'], ['Clientes', 'Clientes'], ['Proveedores', 'Proveedores'], ['Delivery', 'Delivery'],
  ['Historial', 'Historial'], ['Conocimiento', 'Base de conocimiento'], ['Reportes', 'Reportes'], ['KPI', 'KPI'], ['Usuarios', 'Usuarios'], ['Configuracion', 'Configuración']];
const ACTS = ['Ver', 'Crear', 'Editar', 'Eliminar', 'Exportar'];
const b = (v) => v === true || String(v).toUpperCase() === 'TRUE';

/* ---------- Mi cuenta ---------- */
// Borra la copia guardada de la app (caché) y la vuelve a descargar, para recibir la última versión
async function actualizarApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* seguir igual */ }
  window.location.reload();
}

export function Cuenta() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ actual: '', nueva: '', nueva2: '' });
  const go = async (e) => {
    e.preventDefault();
    if (f.nueva !== f.nueva2) { toast('Las contraseñas nuevas no coinciden', true); return; }
    try { await call('cambiarPassword', { actual: f.actual, nueva: f.nueva }); toast('Contraseña actualizada'); setF({ actual: '', nueva: '', nueva2: '' }); } catch (x) { toast(x.message, true); }
  };
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <div className="pagehead"><h1>Mi cuenta</h1></div>
      <div className="card"><b>{user.Nombre}</b><div className="muted">{user.Email}</div></div>
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div><b>Versión de la app</b><div className="muted small">{typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'desarrollo'}</div></div>
        <button type="button" className="btn" onClick={actualizarApp}>Buscar actualización</button>
      </div>
      <form className="card stack" onSubmit={go}>
        <h2>Cambiar contraseña</h2>
        <label className="f">Contraseña actual<input className="input" type="password" autoComplete="current-password" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} required /></label>
        <label className="f">Nueva contraseña (mín. 8 caracteres)<input className="input" type="password" autoComplete="new-password" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} required minLength={8} /></label>
        <label className="f">Repite la nueva contraseña<input className="input" type="password" autoComplete="new-password" value={f.nueva2} onChange={(e) => setF({ ...f, nueva2: e.target.value })} required /></label>
        <div className="row"><button className="btn primary">Guardar</button><button type="button" className="btn" onClick={logout}><Icon n="out" />Cerrar sesión</button></div>
      </form>
    </div>
  );
}

/* ---------- Configuración (logo, datos del negocio, parámetros) ---------- */
const CFG = [
  ['NOMBRE_NEGOCIO', 'Nombre del negocio'], ['DOCUMENTO_NEGOCIO', 'RUT / ID fiscal'], ['DIRECCION_NEGOCIO', 'Dirección del local'],
  ['MONEDA', 'Moneda (CLP, USD, EUR…)'], ['IMPUESTO_PORC', 'Impuesto (0.19 = 19%)'], ['TARIFA_BASE_DELIVERY', 'Tarifa base de delivery'],
  ['TARIFA_KM_DELIVERY', 'Tarifa por km de delivery'], ['ORIGEN_LATLONG', 'Coordenadas del local (lat,long)']
];
export function Configuracion() {
  const { config, refresh, can, feat, user } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({ ...config });
  const [busy, setBusy] = useState(false);
  const edit = can('Configuracion', 'Editar');
  const save = async (vals) => {
    setBusy(true);
    try { await call('guardarConfig', { valores: vals }); await refresh(); toast('Configuración guardada'); } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <div className="pagehead"><h1>Configuración</h1></div>
      {user.ID_Rol === 'R01' && <SubscriptionCard />}
      <div className="card stack">
        <h2>Logo y color</h2>
        <p className="muted small">El logo aparece en el login, el menú, los tickets y el ícono de la pestaña, para todos los perfiles.</p>
        <div className="row">
          <FileInput value={v.LOGO} modulo="Configuracion" label="Subir logo" onChange={(u) => { setV({ ...v, LOGO: u }); if (edit) save({ LOGO: u }); }} />
          <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>Color principal
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(v.COLOR_PRIMARIO || '') ? v.COLOR_PRIMARIO : '#4f46e5'} onChange={(e) => setV({ ...v, COLOR_PRIMARIO: e.target.value })} disabled={!edit} /></label>
          {edit && <button className="btn sm" onClick={() => save({ COLOR_PRIMARIO: v.COLOR_PRIMARIO || '#4f46e5' })}>Guardar color</button>}
        </div>
      </div>
      <div className="card stack">
        <h2>Datos del negocio</h2>
        <div className="formgrid">{CFG.map(([k, l]) => <label key={k} className="f">{l}<input className="input" disabled={!edit} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
          <label className="f">Formato de impresión por defecto
            <select className="input" disabled={!edit} value={v.FORMATO_DOC_DEFECTO || 'Termica 80mm'} onChange={(e) => setV({ ...v, FORMATO_DOC_DEFECTO: e.target.value })}>
              {['Termica 58mm', 'Termica 80mm', 'A4 Carta'].map((o) => <option key={o}>{o}</option>)}</select></label>
        </div>
        {feat('comanda') && <><label className="chk"><input type="checkbox" disabled={!edit} checked={b(v.COMANDA_AUTO ?? false)} onChange={(e) => setV({ ...v, COMANDA_AUTO: e.target.checked })} />Al vender, abrir primero la comanda de cocina</label>
        <label className="f">Formato de la comanda
          <select className="input" disabled={!edit} value={v.FORMATO_COMANDA || 'Termica 80mm'} onChange={(e) => setV({ ...v, FORMATO_COMANDA: e.target.value })}>
            <option>Termica 58mm</option><option>Termica 80mm</option><option>A4 Carta</option>
          </select>
        </label></>}
        <label className="chk"><input type="checkbox" disabled={!edit} checked={b(v.ALERTA_STOCK_ACTIVA ?? true)} onChange={(e) => setV({ ...v, ALERTA_STOCK_ACTIVA: e.target.checked })} />Generar alertas de stock mínimo</label>
        <label className="chk"><input type="checkbox" disabled={!edit} checked={b(v.PERMITIR_STOCK_NEGATIVO ?? false)} onChange={(e) => setV({ ...v, PERMITIR_STOCK_NEGATIVO: e.target.checked })} />Permitir vender sin stock (queda negativo)</label>
        {edit && <div><button className="btn primary" disabled={busy} onClick={() => save(Object.fromEntries([...CFG.map(([k]) => k), 'FORMATO_DOC_DEFECTO', 'FORMATO_COMANDA', 'COMANDA_AUTO', 'ALERTA_STOCK_ACTIVA', 'PERMITIR_STOCK_NEGATIVO'].map((k) => [k, v[k] ?? ''])))}>Guardar cambios</button></div>}
      </div>
      <div className="card stack"><h2>Unidades de medida</h2><Unidades /></div>
    </div>
  );
}

/* ---------- Usuarios, roles y permisos ---------- */
export function Usuarios() {
  const { can, user: me, isDelivery, maxUsuarios } = useAuth();
  const toast = useToast();
  const users = useTable('Usuarios');
  const [roles, setRoles] = useState([]);
  const [dels, setDels] = useState([]);
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState(null);
  const [permFor, setPermFor] = useState(null);
  const [tab, setTab] = useState('usuarios');
  useEffect(() => { listar('Roles').then(setRoles).catch(() => {}); listar('Deliverys').then(setDels).catch(() => {}); }, []);
  const roleName = (id) => (roles.find((r) => r.ID_Rol === id) || {}).Nombre_Rol || id;
  const isMaster = me.ID_Rol === 'R01';

  const save = async (e) => {
    e.preventDefault();
    try {
      if (form.ID_Usuario) await call('usuariosActualizar', { ID_Usuario: form.ID_Usuario, Nombre: form.Nombre, Telefono: form.Telefono, ID_Rol: form.ID_Rol, ID_Delivery: form.ID_Delivery || '', Activo: b(form.Activo) });
      else await call('usuariosCrear', form);
      toast('Usuario guardado'); setForm(null); users.reload();
    } catch (x) { toast(x.message, true); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    try { await call('usuariosPassword', { ID_Usuario: pw.ID_Usuario, password: pw.password }); toast('Contraseña restablecida'); setPw(null); } catch (x) { toast(x.message, true); }
  };
  return (
    <div className="stack">
      <div className="pagehead"><h1>Usuarios y permisos</h1>
        {can('Usuarios', 'Crear') && tab === 'usuarios' && <button className="btn primary" onClick={() => setForm({ Email: '', Nombre: '', Telefono: '', ID_Rol: 'R02', ID_Delivery: '', password: '', Activo: true })}><Icon n="plus" />Nuevo usuario</button>}
      </div>
      {maxUsuarios > 0 && users.rows && <p className="muted small">Usuarios activos: {users.rows.filter((u) => String(u.Activo).toUpperCase() !== 'FALSE').length} de {maxUsuarios} incluidos en tu plan.</p>}
      <div className="tabs"><button className={tab === 'usuarios' ? 'on' : ''} onClick={() => setTab('usuarios')}>Usuarios</button>{isMaster && <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Roles y permisos</button>}</div>
      {users.err && <div className="alert">{users.err}</div>}
      {tab === 'usuarios' && (
        <div className="card" style={{ padding: 6 }}>
          <table className="t">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th /></tr></thead>
            <tbody>{(users.rows || []).map((u) => (
              <tr key={u.ID_Usuario}>
                <td data-label="Nombre"><b>{u.Nombre}</b></td><td data-label="Correo">{u.Email}</td><td data-label="Rol">{roleName(u.ID_Rol)}</td>
                <td data-label="Estado">{b(u.Activo) ? <span className="badge ok">Activo</span> : <span className="badge bad">Deshabilitado</span>}</td>
                <td data-label="Último acceso">{fdt(u.Ultimo_Login)}</td>
                <td className="actions"><div className="row" style={{ justifyContent: 'flex-end' }}>
                  {can('Usuarios', 'Editar') && <button className="btn sm" onClick={() => setForm({ ...u })}>Editar</button>}
                  {can('Usuarios', 'Editar') && <button className="btn sm" onClick={() => setPw({ ID_Usuario: u.ID_Usuario, Nombre: u.Nombre, password: '' })}>Contraseña</button>}
                  {isMaster && u.ID_Rol !== 'R01' && <button className="btn sm" onClick={() => setPermFor(u)}>Permisos</button>}
                </div></td>
              </tr>))}</tbody>
          </table>
        </div>)}
      {tab === 'roles' && <Roles roles={roles} reloadRoles={() => listar('Roles').then(setRoles)} />}

      {form && (
        <Modal title={form.ID_Usuario ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setForm(null)}>
          <form className="stack" onSubmit={save}>
            <div className="formgrid">
              <label className="f">Nombre *<input className="input" required value={form.Nombre} onChange={(e) => setForm({ ...form, Nombre: e.target.value })} /></label>
              <label className="f">Correo *<input className="input" type="email" required disabled={!!form.ID_Usuario} value={form.Email} onChange={(e) => setForm({ ...form, Email: e.target.value })} /></label>
              <label className="f">Teléfono<input className="input" value={form.Telefono || ''} onChange={(e) => setForm({ ...form, Telefono: e.target.value })} /></label>
              <label className="f">Rol *<select className="input" value={form.ID_Rol} onChange={(e) => setForm({ ...form, ID_Rol: e.target.value })}>{roles.filter((r) => isMaster || r.ID_Rol !== 'R01').map((r) => <option key={r.ID_Rol} value={r.ID_Rol}>{r.Nombre_Rol}</option>)}</select></label>
              <label className="f">Vincular a repartidor (si es perfil Delivery)
                <select className="input" value={form.ID_Delivery || ''} onChange={(e) => setForm({ ...form, ID_Delivery: e.target.value })}><option value="">— ninguno —</option>{dels.map((d) => <option key={d.ID_Delivery} value={d.ID_Delivery}>{d.Nombre}</option>)}</select></label>
              {!form.ID_Usuario && <label className="f">Contraseña inicial * (mín. 8)<input className="input" type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>}
              {form.ID_Usuario && <label className="chk"><input type="checkbox" checked={b(form.Activo)} onChange={(e) => setForm({ ...form, Activo: e.target.checked })} />Usuario activo</label>}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn primary">Guardar</button></div>
          </form>
        </Modal>)}
      {pw && (
        <Modal title={'Nueva contraseña: ' + pw.Nombre} onClose={() => setPw(null)}>
          <form className="stack" onSubmit={savePw}>
            <label className="f">Contraseña nueva (mín. 8)<input className="input" required minLength={8} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setPw(null)}>Cancelar</button><button className="btn primary">Restablecer</button></div>
          </form>
        </Modal>)}
      {permFor && <PermModal user={permFor} roleName={roleName(permFor.ID_Rol)} onClose={() => setPermFor(null)} />}
    </div>
  );
}

function Matrix({ matriz, setMatriz, disabled }) {
  const toggle = (m, a) => setMatriz((x) => x.map((r) => (r.Modulo === m ? { ...r, [a]: !r[a] } : r)));
  return (
    <div style={{ overflow: 'auto' }}>
      <table className="t matrix">
        <thead><tr><th>Módulo</th>{ACTS.map((a) => <th key={a}>{a}</th>)}</tr></thead>
        <tbody>{matriz.map((r) => (
          <tr key={r.Modulo}><td><b>{(MODS.find((m) => m[0] === r.Modulo) || [])[1] || r.Modulo}</b></td>
            {ACTS.map((a) => <td key={a}><input type="checkbox" disabled={disabled} checked={!!r[a]} onChange={() => toggle(r.Modulo, a)} aria-label={r.Modulo + ' ' + a} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} /></td>)}</tr>))}</tbody>
      </table>
    </div>
  );
}

function PermModal({ user, roleName, onClose }) {
  const toast = useToast();
  const [m, setM] = useState(null);
  useEffect(() => {
    Promise.all([listar('Permisos'), listar('Permisos_Usuario')]).then(([pr, pu]) => {
      const base = MODS.map(([k]) => {
        const r = pr.find((p) => p.ID_Rol === user.ID_Rol && p.Modulo === k) || {};
        const o = pu.find((p) => p.ID_Usuario === user.ID_Usuario && p.Modulo === k) || r;
        const x = { Modulo: k }; ACTS.forEach((a) => (x[a] = b(o[a]))); return x;
      });
      setM(base);
    });
  }, [user]);
  const save = async () => { try { await call('permisosGuardar', { ID_Usuario: user.ID_Usuario, matriz: m }); toast('Permisos guardados'); onClose(); } catch (e) { toast(e.message, true); } };
  return (
    <Modal title={'Permisos de ' + user.Nombre} onClose={onClose} wide>
      <p className="muted small">Parte de los permisos del rol «{roleName}». Lo que cambies aquí aplica solo a este usuario. Los cambios se aplican en 2 minutos como máximo.</p>
      {m ? <Matrix matriz={m} setMatriz={setM} /> : <p className="muted">Cargando…</p>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar permisos</button></div>
    </Modal>
  );
}

function Roles({ roles, reloadRoles }) {
  const toast = useToast();
  const [sel, setSel] = useState('R02');
  const [m, setM] = useState(null);
  const [nuevo, setNuevo] = useState('');
  useEffect(() => {
    listar('Permisos').then((pr) => {
      setM(MODS.map(([k]) => { const r = pr.find((p) => p.ID_Rol === sel && p.Modulo === k) || {}; const x = { Modulo: k }; ACTS.forEach((a) => (x[a] = b(r[a]))); return x; }));
    }).catch(() => setM([]));
  }, [sel]);
  const save = async () => { try { await call('permisosGuardar', { ID_Rol: sel, matriz: m }); toast('Permisos del rol guardados'); } catch (e) { toast(e.message, true); } };
  const add = async (e) => {
    e.preventDefault();
    try { const r = await call('crear', { tabla: 'Roles', datos: { Nombre_Rol: nuevo, Descripcion: '' } }); setNuevo(''); await reloadRoles(); setSel(r.ID_Rol); toast('Rol creado: ahora define sus permisos'); } catch (x) { toast(x.message, true); }
  };
  return (
    <div className="stack">
      <div className="card stack">
        <div className="row">
          <label className="f" style={{ minWidth: 220 }}>Rol
            <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>{roles.filter((r) => r.ID_Rol !== 'R01').map((r) => <option key={r.ID_Rol} value={r.ID_Rol}>{r.Nombre_Rol}</option>)}</select></label>
          <form className="row" onSubmit={add}><input className="input" style={{ maxWidth: 220 }} placeholder="Nuevo rol (ej. Supervisor)" value={nuevo} onChange={(e) => setNuevo(e.target.value)} required /><button className="btn">Crear rol</button></form>
        </div>
        <p className="muted small">El rol Master siempre tiene todos los permisos. Marca qué puede hacer cada rol en cada módulo.</p>
        {m && <Matrix matriz={m} setMatriz={setM} />}
        <div><button className="btn primary" onClick={save}>Guardar permisos del rol</button></div>
      </div>
    </div>
  );
}
