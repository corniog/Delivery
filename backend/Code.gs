// ============================================================
//  API del negocio  -  Google Apps Script (Web App)
//  Todo pasa por aquí: login, permisos, inventario, ventas, delivery.
//  La app NUNCA toca el Sheet directo: la seguridad se valida en este archivo.
// ============================================================

function doGet() {
  return json_({ ok: true, data: { app: 'App Negocio API', version: '1.0' } });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Solicitud inválida' });
  }
  try {
    return json_({ ok: true, data: route_(req) });
  } catch (err) {
    return json_({ ok: false, error: err.message || String(err), code: err.code || '', licencia: err.data || null });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(msg, code) {
  const e = new Error(msg);
  e.code = code || '';
  throw e;
}

// ---------- Rutas ----------
function route_(req) {
  const a = req.accion;
  const d = req.datos || {};
  if (a === 'publico') return publico_(d);
  // Control de suscripción: si está vencida/suspendida, NADA funciona (ni el login)
  const lic = licencia_();
  if (lic.bloqueada) { const e = new Error(lic.mensaje); e.code = 'LICENSE'; e.data = licenciaPublica_(lic); throw e; }
  if (a === 'login') return login_(d);
  const ctx = authenticate_(req.token);
  const fn = ACTIONS[a];
  if (!fn) fail_('Acción desconocida: ' + a);
  checkFunciones_(a, d);
  return fn(ctx, d);
}

const ACTIONS = {
  me: me_,
  logout: logout_,
  cambiarPassword: cambiarPassword_,
  listar: listar_,
  crear: crear_,
  actualizar: actualizar_,
  eliminar: eliminar_,
  ajustarStock: ajustarStock_,
  crearVenta: crearVenta_,
  anularVenta: anularVenta_,
  listarVentas: listarVentas_,
  detalleVenta: detalleVenta_,
  misServicios: misServicios_,
  servicioEstado: servicioEstado_,
  historialDelivery: historialDelivery_,
  marcarAlertas: marcarAlertas_,
  kpi: kpi_,
  subirArchivo: subirArchivo_,
  guardarConfig: guardarConfig_,
  usuariosCrear: usuariosCrear_,
  usuariosActualizar: usuariosActualizar_,
  usuariosPassword: usuariosPassword_,
  permisosGuardar: permisosGuardar_,
  exportar: exportar_,
  crearCompra: crearCompra_,
  recibirCompra: recibirCompra_,
  anularCompra: anularCompra_,
  listarCompras: listarCompras_,
  ubicacion: ubicacion_,
  mapaVivo: mapaVivo_,
  suscripcion: suscripcion_
};

// Tablas que se pueden manejar con listar/crear/actualizar/eliminar
const TABLES = {
  Productos: { key: 'ID_Producto', prefix: 'P', module: 'Inventario' },
  Categorias: { key: 'ID_Categoria', prefix: 'C', module: 'Categorias' },
  Unidades: { key: 'Unidad', module: 'Inventario' },
  Clientes: { key: 'ID_Cliente', prefix: 'CL', module: 'Clientes' },
  Proveedores: { key: 'ID_Proveedor', prefix: 'PR', module: 'Proveedores' },
  Visitas_Proveedor: { key: 'ID_Visita', prefix: 'VP', module: 'Proveedores' },
  Deliverys: { key: 'ID_Delivery', prefix: 'D', module: 'Delivery' },
  Categorias_Conocimiento: { key: 'ID_CatCon', prefix: 'CK', module: 'Conocimiento' },
  Conocimiento: { key: 'ID_Conocimiento', prefix: 'K', module: 'Conocimiento' },
  Roles: { key: 'ID_Rol', prefix: 'R', module: 'Usuarios' },
  Permisos: { key: 'ID_Permiso', module: 'Usuarios' },
  Permisos_Usuario: { key: 'ID_PermU', prefix: 'PU', module: 'Usuarios' }
};
// Tablas de solo lectura (se escriben con acciones propias)
const READ_ONLY = {
  Ventas: 'Ventas', Detalle_Venta: 'Ventas', Documentos: 'Ventas', Compras: 'Proveedores', Detalle_Compra: 'Proveedores',
  Movimientos_Inventario: 'Inventario', Servicios_Delivery: 'Delivery',
  Ubicaciones_Delivery: 'Delivery', Auditoria: 'Configuracion', Configuracion: null
};
// Columnas que nunca se pueden escribir desde la app
const PROTECTED_COLS = { Productos: ['Stock_Actual'] };
// Cambios en estas tablas obligan a recalcular permisos en caché
const AUTH_TABLES = { Roles: 1, Permisos: 1, Permisos_Usuario: 1, Usuarios: 1 };

// ---------- Acceso a hojas ----------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) fail_('Falta la hoja "' + name + '". Ejecuta instalar() en el editor de Apps Script.');
  return sh;
}

function headers_(name) { return SCHEMA[name]; }

function tz_() { return ss_().getSpreadsheetTimeZone() || 'America/Santiago'; }

function fmtDT_(d) { return Utilities.formatDate(d, tz_(), "yyyy-MM-dd'T'HH:mm:ss"); }
function fmtD_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }

function norm_(v) {
  if (v instanceof Date) return fmtDT_(v);
  return v;
}

function readAll_(name) {
  const sh = sheet_(name);
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0];
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const row = v[i];
    let empty = true;
    for (let j = 0; j < row.length; j++) if (row[j] !== '') { empty = false; break; }
    if (empty) continue;
    const o = { _row: i + 1 };
    for (let j = 0; j < h.length; j++) o[h[j]] = norm_(row[j]);
    out.push(o);
  }
  return out;
}

function insert_(name, obj) {
  const sh = sheet_(name);
  const h = headers_(name);
  sh.appendRow(h.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : obj[c]; }));
}

function update_(name, row, patch) {
  const sh = sheet_(name);
  const h = headers_(name);
  const cur = sh.getRange(row, 1, 1, h.length).getValues()[0];
  const next = h.map(function (c, i) {
    return patch[c] !== undefined && patch[c] !== null ? patch[c] : (patch[c] === null ? '' : cur[i]);
  });
  sh.getRange(row, 1, 1, h.length).setValues([next]);
}

function findBy_(name, col, val) {
  const rows = readAll_(name);
  for (let i = 0; i < rows.length; i++) if (String(rows[i][col]) === String(val)) return rows[i];
  return null;
}

function newId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function nextNum_(key) {
  const p = PropertiesService.getScriptProperties();
  const n = (parseInt(p.getProperty('n_' + key), 10) || 0) + 1;
  p.setProperty('n_' + key, String(n));
  return n;
}

function pad_(n, w) { let s = String(n); while (s.length < w) s = '0' + s; return s; }
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function round2_(n) { return Math.round(n * 100) / 100; }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function config_() {
  const o = {};
  readAll_('Configuracion').forEach(function (r) { o[r.Clave] = r.Valor; });
  return o;
}

function audit_(ctx, modulo, accion, registro, detalle) {
  try {
    insert_('Auditoria', {
      ID_Log: newId_('L'), Fecha: fmtDT_(new Date()), Usuario: ctx ? ctx.user.Email : '',
      Modulo: modulo, Accion: accion, Registro: registro || '', Detalle: detalle || ''
    });
  } catch (e) { /* la auditoría nunca debe romper la operación */ }
}

// ---------- Autenticación ----------
function hash_(password, salt) {
  let h = salt + password;
  for (let i = 0; i < 200; i++) {
    const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + i);
    h = d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  }
  return h;
}

function publico_(d) {
  const c = config_();
  if (d && d.refrescar) licenciaRefrescar_();
  return { NOMBRE_NEGOCIO: c.NOMBRE_NEGOCIO || 'Mi Negocio', LOGO: c.LOGO || '', licencia: licenciaPublica_(licencia_()) };
}

function login_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  const password = String(d.password || '');
  if (!email || !password) fail_('Ingresa correo y contraseña');
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + email;
  const fails = parseInt(cache.get(failKey), 10) || 0;
  if (fails >= 5) fail_('Demasiados intentos. Espera 10 minutos e inténtalo de nuevo.');
  const users = readAll_('Usuarios');
  let user = null;
  for (let i = 0; i < users.length; i++) {
    if (String(users[i].Email).trim().toLowerCase() === email) { user = users[i]; break; }
  }
  if (!user || !bool_(user.Activo) || hash_(password, String(user.Salt)) !== String(user.Password_Hash)) {
    cache.put(failKey, String(fails + 1), 600);
    fail_('Correo o contraseña incorrectos');
  }
  cache.remove(failKey);
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('tok_' + token, user.ID_Usuario, SESSION_SECONDS);
  update_('Usuarios', user._row, { Ultimo_Login: fmtDT_(new Date()) });
  const ctx = buildCtx_(user);
  audit_(ctx, 'Usuarios', 'Login', user.ID_Usuario, '');
  return Object.assign({ token: token }, meData_(ctx));
}

function ctxVersion_() {
  return PropertiesService.getScriptProperties().getProperty('ctxver') || '0';
}
function ctxBump_() {
  PropertiesService.getScriptProperties().setProperty('ctxver', String((parseInt(ctxVersion_(), 10) || 0) + 1));
}

function authenticate_(token) {
  if (!token) fail_('Sesión no iniciada', 'AUTH');
  const cache = CacheService.getScriptCache();
  const uid = cache.get('tok_' + token);
  if (!uid) fail_('Tu sesión expiró. Vuelve a iniciar sesión.', 'AUTH');
  const key = 'ctx_' + ctxVersion_() + '_' + uid;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const user = findBy_('Usuarios', 'ID_Usuario', uid);
  if (!user || !bool_(user.Activo)) fail_('Usuario deshabilitado', 'AUTH');
  const ctx = buildCtx_(user);
  cache.put(key, JSON.stringify(ctx), 120);
  return ctx;
}

function buildCtx_(user) {
  const safe = {
    ID_Usuario: user.ID_Usuario, Email: user.Email, Nombre: user.Nombre, Telefono: user.Telefono,
    ID_Rol: user.ID_Rol, ID_Delivery: user.ID_Delivery || ''
  };
  return { user: safe, perms: perms_(safe) };
}

function perms_(user) {
  const all = {};
  MODULES.forEach(function (m) {
    all[m] = {};
    ACTIONS_LIST.forEach(function (a) { all[m][a] = user.ID_Rol === MASTER_ROLE; });
  });
  if (user.ID_Rol === MASTER_ROLE) return all;
  function apply(rows) {
    rows.forEach(function (p) {
      if (!all[p.Modulo]) return;
      ACTIONS_LIST.forEach(function (a) { all[p.Modulo][a] = bool_(p[a]); });
    });
  }
  apply(readAll_('Permisos').filter(function (p) { return p.ID_Rol === user.ID_Rol; }));
  apply(readAll_('Permisos_Usuario').filter(function (p) { return p.ID_Usuario === user.ID_Usuario; }));
  return all;
}

function can_(ctx, module, action) {
  return !!(ctx.perms[module] && ctx.perms[module][action]);
}
function need_(ctx, module, action) {
  if (!can_(ctx, module, action)) fail_('No tienes permiso para ' + action.toLowerCase() + ' en ' + module, 'PERM');
}
function isMaster_(ctx) { return ctx.user.ID_Rol === MASTER_ROLE; }
function isDelivery_(ctx) { return !!ctx.user.ID_Delivery; }

function meData_(ctx) {
  const c = config_();
  const l = licencia_();
  return { user: ctx.user, perms: ctx.perms, config: c, funciones: l.funciones, maxUsuarios: l.maxUsuarios };
}

function me_(ctx) { return meData_(ctx); }

function logout_(ctx, d) { return true; }

function cambiarPassword_(ctx, d) {
  const user = findBy_('Usuarios', 'ID_Usuario', ctx.user.ID_Usuario);
  if (hash_(String(d.actual || ''), String(user.Salt)) !== String(user.Password_Hash)) fail_('La contraseña actual no es correcta');
  checkPassword_(d.nueva);
  const salt = Utilities.getUuid();
  update_('Usuarios', user._row, { Salt: salt, Password_Hash: hash_(String(d.nueva), salt) });
  audit_(ctx, 'Usuarios', 'Editar', user.ID_Usuario, 'Cambio de contraseña');
  return true;
}

function checkPassword_(p) {
  if (!p || String(p).length < 8) fail_('La contraseña debe tener al menos 8 caracteres');
}

// ---------- CRUD genérico ----------
function cleanRow_(table, row) {
  const o = {};
  headers_(table).forEach(function (c) { o[c] = row[c]; });
  return o;
}

function listar_(ctx, d) {
  const t = d.tabla;
  const cfg = TABLES[t];
  if (cfg) {
    need_(ctx, cfg.module, 'Ver');
    let rows = readAll_(t);
    if (t === 'Deliverys' && isDelivery_(ctx)) rows = rows.filter(function (r) { return r.ID_Delivery === ctx.user.ID_Delivery; });
    return rows.map(function (r) { return cleanRow_(t, r); });
  }
  if (t === 'Usuarios') {
    need_(ctx, 'Usuarios', 'Ver');
    return readAll_('Usuarios').map(function (u) {
      const o = cleanRow_('Usuarios', u);
      delete o.Password_Hash; delete o.Salt;
      return o;
    });
  }
  if (t === 'Alertas') {
    const rows = readAll_('Alertas').filter(function (a) {
      return isMaster_(ctx) || String(a.Para_Rol).split(',').indexOf(ctx.user.ID_Rol) >= 0;
    });
    return rows.map(function (r) { return cleanRow_('Alertas', r); });
  }
  if (t === 'Configuracion') {
    return readAll_('Configuracion').map(function (r) { return cleanRow_(t, r); });
  }
  if (READ_ONLY.hasOwnProperty(t)) {
    const m = READ_ONLY[t];
    need_(ctx, m, 'Ver');
    if (t === 'Servicios_Delivery' || t === 'Ubicaciones_Delivery') fail_('Usa misServicios o historialDelivery');
    return readAll_(t).map(function (r) { return cleanRow_(t, r); });
  }
  fail_('Tabla desconocida: ' + t);
}

function writable_(table, datos) {
  const prot = PROTECTED_COLS[table] || [];
  const o = {};
  headers_(table).forEach(function (c) {
    if (datos[c] !== undefined && prot.indexOf(c) < 0) o[c] = datos[c];
  });
  return o;
}

function crear_(ctx, d) {
  const t = d.tabla;
  const cfg = TABLES[t];
  if (!cfg) fail_('No se puede crear en ' + t);
  need_(ctx, cfg.module, 'Crear');
  if (t === 'Roles' || t === 'Permisos' || t === 'Permisos_Usuario') { if (!isMaster_(ctx)) fail_('Solo el Master puede modificar roles y permisos', 'PERM'); }
  const datos = writable_(t, d.datos || {});
  if (!datos[cfg.key]) datos[cfg.key] = cfg.prefix ? newId_(cfg.prefix) : fail_('Falta ' + cfg.key);
  if (cfg.key === 'Unidad' || t === 'Permisos') {
    if (findBy_(t, cfg.key, datos[cfg.key])) fail_('Ya existe un registro con ese valor');
  }
  const now = fmtDT_(new Date());
  if (headers_(t).indexOf('Fecha_Creacion') >= 0 && !datos.Fecha_Creacion) datos.Fecha_Creacion = now;
  if (headers_(t).indexOf('Fecha') >= 0 && !datos.Fecha && t !== 'Detalle_Compra') datos.Fecha = now;
  let stockInicial = 0;
  if (t === 'Productos') {
    stockInicial = num_((d.datos || {}).Stock_Actual);
    if (!datos.Nombre) fail_('El producto necesita un nombre');
    datos.Stock_Actual = stockInicial;
    if (datos.Activo === undefined || datos.Activo === '') datos.Activo = true;
    if (datos.Codigo_Barras) {
      const dup = readAll_('Productos').filter(function (p) { return String(p.Codigo_Barras) === String(datos.Codigo_Barras); });
      if (dup.length) fail_('Ya existe un producto con ese código de barras: ' + dup[0].Nombre);
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    insert_(t, datos);
    if (t === 'Productos' && stockInicial > 0) {
      insert_('Movimientos_Inventario', {
        ID_Mov: newId_('M'), Fecha: now, ID_Producto: datos.ID_Producto, Tipo: 'Entrada compra',
        Cantidad: stockInicial, Stock_Antes: 0, Stock_Despues: stockInicial, Referencia: 'Stock inicial',
        Usuario: ctx.user.Email, Nota: 'Alta del producto'
      });
    }
  } finally { lock.releaseLock(); }
  if (AUTH_TABLES[t]) ctxBump_();
  audit_(ctx, cfg.module, 'Crear', datos[cfg.key], t);
  return cleanRow_(t, datos);
}

function actualizar_(ctx, d) {
  const t = d.tabla;
  const cfg = TABLES[t];
  if (!cfg) fail_('No se puede editar ' + t);
  need_(ctx, cfg.module, 'Editar');
  if (t === 'Roles' || t === 'Permisos' || t === 'Permisos_Usuario') { if (!isMaster_(ctx)) fail_('Solo el Master puede modificar roles y permisos', 'PERM'); }
  const cur = findBy_(t, cfg.key, d.id);
  if (!cur) fail_('Registro no encontrado');
  const datos = writable_(t, d.datos || {});
  delete datos[cfg.key];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { update_(t, cur._row, datos); } finally { lock.releaseLock(); }
  if (AUTH_TABLES[t]) ctxBump_();
  audit_(ctx, cfg.module, 'Editar', d.id, t);
  return true;
}

function eliminar_(ctx, d) {
  const t = d.tabla;
  const cfg = TABLES[t];
  if (!cfg) fail_('No se puede eliminar en ' + t);
  need_(ctx, cfg.module, 'Eliminar');
  if (t === 'Roles' || t === 'Permisos' || t === 'Permisos_Usuario') { if (!isMaster_(ctx)) fail_('Solo el Master puede modificar roles y permisos', 'PERM'); }
  if (t === 'Roles' && (d.id === MASTER_ROLE)) fail_('No se puede eliminar el rol Master');
  const cur = findBy_(t, cfg.key, d.id);
  if (!cur) fail_('Registro no encontrado');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { sheet_(t).deleteRow(cur._row); } finally { lock.releaseLock(); }
  if (AUTH_TABLES[t]) ctxBump_();
  audit_(ctx, cfg.module, 'Eliminar', d.id, t);
  return true;
}

// ---------- Inventario ----------
function ajustarStock_(ctx, d) {
  need_(ctx, 'Inventario', 'Editar');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = findBy_('Productos', 'ID_Producto', d.ID_Producto);
    if (!p) fail_('Producto no encontrado');
    const antes = num_(p.Stock_Actual);
    let despues;
    const tipo = d.tipo;
    if (tipo === 'Ajuste') {
      despues = num_(d.nuevoStock);
      if (despues < 0) fail_('El stock no puede ser negativo');
    } else if (tipo === 'Entrada compra') {
      if (!(num_(d.cantidad) > 0)) fail_('Cantidad inválida');
      despues = antes + num_(d.cantidad);
    } else if (tipo === 'Merma') {
      if (!(num_(d.cantidad) > 0)) fail_('Cantidad inválida');
      despues = antes - num_(d.cantidad);
      if (despues < 0) fail_('La merma supera el stock disponible');
    } else fail_('Tipo de movimiento inválido');
    update_('Productos', p._row, { Stock_Actual: despues });
    insert_('Movimientos_Inventario', {
      ID_Mov: newId_('M'), Fecha: fmtDT_(new Date()), ID_Producto: p.ID_Producto, Tipo: tipo,
      Cantidad: Math.abs(despues - antes), Stock_Antes: antes, Stock_Despues: despues,
      Referencia: d.referencia || '', Usuario: ctx.user.Email, Nota: d.nota || ''
    });
    stockAlert_(p, despues);
    audit_(ctx, 'Inventario', 'Editar', p.ID_Producto, tipo + ': ' + antes + ' → ' + despues);
    return { ID_Producto: p.ID_Producto, Stock_Actual: despues };
  } finally { lock.releaseLock(); }
}

function stockAlert_(p, nuevoStock) {
  const c = config_();
  if (c.ALERTA_STOCK_ACTIVA !== undefined && !bool_(c.ALERTA_STOCK_ACTIVA)) return;
  const min = num_(p.Stock_Minimo);
  if (nuevoStock > min) return;
  const existe = readAll_('Alertas').some(function (a) {
    return a.Tipo === 'Stock minimo' && String(a.Referencia) === String(p.ID_Producto) && !bool_(a.Leida);
  });
  if (existe) return;
  insert_('Alertas', {
    ID_Alerta: newId_('A'), Fecha: fmtDT_(new Date()), Tipo: 'Stock minimo', Referencia: p.ID_Producto,
    Mensaje: p.Nombre + ' llegó al stock mínimo (quedan ' + nuevoStock + ', mínimo ' + min + ')',
    Para_Rol: 'R01,R02', Leida: false
  });
}

function marcarAlertas_(ctx, d) {
  const ids = d.ids || [];
  readAll_('Alertas').forEach(function (a) {
    const mine = isMaster_(ctx) || String(a.Para_Rol).split(',').indexOf(ctx.user.ID_Rol) >= 0;
    if (mine && (d.todas || ids.indexOf(a.ID_Alerta) >= 0) && !bool_(a.Leida)) update_('Alertas', a._row, { Leida: true });
  });
  return true;
}

// ---------- Compras a proveedores ----------
function entradaCompra_(ctx, compra, detalles, actualizarCosto) {
  const productos = {};
  readAll_('Productos').forEach(function (p) { productos[p.ID_Producto] = p; });
  const fh = fmtDT_(new Date());
  detalles.forEach(function (r) {
    const p = productos[r.ID_Producto];
    if (!p) return;
    const antes = num_(p.Stock_Actual);
    const despues = antes + num_(r.Cantidad);
    const patch = { Stock_Actual: despues };
    if (actualizarCosto && num_(r.Costo_Unitario) > 0) patch.Precio_Compra = num_(r.Costo_Unitario);
    update_('Productos', p._row, patch);
    p.Stock_Actual = despues;
    insert_('Movimientos_Inventario', {
      ID_Mov: newId_('M'), Fecha: fh, ID_Producto: p.ID_Producto, Tipo: 'Entrada compra', Cantidad: num_(r.Cantidad),
      Stock_Antes: antes, Stock_Despues: despues, Referencia: compra.ID_Compra, Usuario: ctx.user.Email, Nota: ''
    });
  });
}

function crearCompra_(ctx, d) {
  need_(ctx, 'Proveedores', 'Crear');
  const prov = findBy_('Proveedores', 'ID_Proveedor', d.ID_Proveedor);
  if (!prov) fail_('Elige un proveedor');
  const itemsIn = d.items || [];
  if (!itemsIn.length) fail_('Agrega al menos un producto');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const productos = {};
    readAll_('Productos').forEach(function (p) { productos[p.ID_Producto] = p; });
    const idc = newId_('CO');
    let total = 0;
    const detalles = itemsIn.map(function (it) {
      const p = productos[it.ID_Producto];
      if (!p) fail_('Producto no encontrado: ' + it.ID_Producto);
      const cant = num_(it.Cantidad), costo = num_(it.Costo_Unitario);
      if (!(cant > 0)) fail_('Cantidad inválida para ' + p.Nombre);
      if (costo < 0) fail_('Costo inválido para ' + p.Nombre);
      const sub = round2_(cant * costo);
      total += sub;
      return { ID_DetCompra: newId_('DC'), ID_Compra: idc, ID_Producto: p.ID_Producto, Cantidad: cant, Costo_Unitario: costo, Subtotal: sub };
    });
    total = round2_(total);
    const recibir = d.recibir !== false;
    const compra = { ID_Compra: idc, Fecha: fmtDT_(new Date()), ID_Proveedor: prov.ID_Proveedor, Total: total,
      Estado: recibir ? 'Recibida' : 'Pendiente', Usuario: ctx.user.Email, Nota: d.nota || '' };
    insert_('Compras', compra);
    detalles.forEach(function (r) { insert_('Detalle_Compra', r); });
    if (recibir) entradaCompra_(ctx, compra, detalles, d.actualizarCosto !== false);
    audit_(ctx, 'Proveedores', 'Crear', idc, 'Compra ' + compra.Estado + ' a ' + prov.Nombre + ' por ' + total);
    return { ID_Compra: idc, Total: total, Estado: compra.Estado };
  } finally { lock.releaseLock(); }
}

function recibirCompra_(ctx, d) {
  need_(ctx, 'Proveedores', 'Editar');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const c = findBy_('Compras', 'ID_Compra', d.ID_Compra);
    if (!c) fail_('Compra no encontrada');
    if (c.Estado !== 'Pendiente') fail_('Solo se pueden recibir compras pendientes');
    const det = readAll_('Detalle_Compra').filter(function (r) { return r.ID_Compra === c.ID_Compra; });
    entradaCompra_(ctx, c, det, d.actualizarCosto !== false);
    update_('Compras', c._row, { Estado: 'Recibida' });
    audit_(ctx, 'Proveedores', 'Editar', c.ID_Compra, 'Compra recibida');
    return true;
  } finally { lock.releaseLock(); }
}

function anularCompra_(ctx, d) {
  need_(ctx, 'Proveedores', 'Eliminar');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const c = findBy_('Compras', 'ID_Compra', d.ID_Compra);
    if (!c) fail_('Compra no encontrada');
    if (c.Estado === 'Anulada') fail_('La compra ya está anulada');
    if (c.Estado === 'Recibida') {
      const productos = {};
      readAll_('Productos').forEach(function (p) { productos[p.ID_Producto] = p; });
      const det = readAll_('Detalle_Compra').filter(function (r) { return r.ID_Compra === c.ID_Compra; });
      det.forEach(function (r) {
        const p = productos[r.ID_Producto];
        if (p && num_(p.Stock_Actual) < num_(r.Cantidad)) fail_('No se puede anular: ya se vendió parte de "' + p.Nombre + '" (stock ' + p.Stock_Actual + ', compra ' + r.Cantidad + ')');
      });
      const fh = fmtDT_(new Date());
      det.forEach(function (r) {
        const p = productos[r.ID_Producto];
        if (!p) return;
        const antes = num_(p.Stock_Actual), despues = antes - num_(r.Cantidad);
        update_('Productos', p._row, { Stock_Actual: despues });
        p.Stock_Actual = despues;
        insert_('Movimientos_Inventario', {
          ID_Mov: newId_('M'), Fecha: fh, ID_Producto: p.ID_Producto, Tipo: 'Anulacion compra', Cantidad: num_(r.Cantidad),
          Stock_Antes: antes, Stock_Despues: despues, Referencia: c.ID_Compra, Usuario: ctx.user.Email, Nota: d.motivo || ''
        });
        stockAlert_(p, despues);
      });
    }
    update_('Compras', c._row, { Estado: 'Anulada' });
    audit_(ctx, 'Proveedores', 'Eliminar', c.ID_Compra, 'Compra anulada. ' + (d.motivo || ''));
    return true;
  } finally { lock.releaseLock(); }
}

function listarCompras_(ctx, d) {
  need_(ctx, 'Proveedores', 'Ver');
  const desde = d.desde || '0000-00-00', hasta = d.hasta || '9999-99-99';
  const provs = {}; readAll_('Proveedores').forEach(function (x) { provs[x.ID_Proveedor] = x.Nombre; });
  const prods = {}; readAll_('Productos').forEach(function (x) { prods[x.ID_Producto] = x.Nombre; });
  const det = {};
  readAll_('Detalle_Compra').forEach(function (r) {
    (det[r.ID_Compra] = det[r.ID_Compra] || []).push({ ID_Producto: r.ID_Producto, Nombre: prods[r.ID_Producto] || r.ID_Producto,
      Cantidad: num_(r.Cantidad), Costo_Unitario: num_(r.Costo_Unitario), Subtotal: num_(r.Subtotal) });
  });
  const rows = readAll_('Compras').filter(function (c) {
    const f = String(c.Fecha).slice(0, 10);
    return f >= desde && f <= hasta && (!d.estado || c.Estado === d.estado) && (!d.ID_Proveedor || c.ID_Proveedor === d.ID_Proveedor);
  }).map(function (c) {
    const o = cleanRow_('Compras', c);
    o.Proveedor = provs[c.ID_Proveedor] || '';
    o.items = det[c.ID_Compra] || [];
    return o;
  });
  rows.sort(function (a, b) { return a.Fecha < b.Fecha ? 1 : -1; });
  const validas = rows.filter(function (r) { return r.Estado !== 'Anulada'; });
  return { rows: rows, total: round2_(validas.reduce(function (s, r) { return s + num_(r.Total); }, 0)), cantidad: validas.length };
}

// ---------- Mapa en vivo ----------
function parseLL_(v) {
  const m = String(v || '').split(',');
  if (m.length !== 2) return null;
  const a = parseFloat(m[0]), b = parseFloat(m[1]);
  return isNaN(a) || isNaN(b) ? null : { lat: a, lng: b };
}

// El repartidor envía su posición (la app lo hace cada ~20 s mientras comparte)
function ubicacion_(ctx, d) {
  if (!isDelivery_(ctx)) fail_('Solo los repartidores comparten ubicación', 'PERM');
  const lat = Number(d.lat), lng = Number(d.lng);
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail_('Ubicación inválida');
  const r = findBy_('Deliverys', 'ID_Delivery', ctx.user.ID_Delivery);
  if (!r) fail_('Repartidor no encontrado');
  const ll = lat.toFixed(6) + ',' + lng.toFixed(6);
  const now = new Date();
  update_('Deliverys', r._row, { Ultima_Ubicacion: ll, Fecha_Ubicacion: fmtDT_(now) });
  // Rastro de la ruta: 1 punto por minuto, solo si hay un pedido en curso
  const cache = CacheService.getScriptCache();
  const key = 'trk_' + r.ID_Delivery;
  if (!cache.get(key)) {
    const act = readAll_('Servicios_Delivery').filter(function (s) {
      return s.ID_Delivery === r.ID_Delivery && (s.Estado === 'Aceptado' || s.Estado === 'En camino');
    })[0];
    if (act) {
      insert_('Ubicaciones_Delivery', { ID_Ubic: newId_('UB'), ID_Servicio: act.ID_Servicio, ID_Delivery: r.ID_Delivery, LatLong: ll, Fecha_Hora: fmtDT_(now) });
      cache.put(key, '1', 60);
    }
  }
  return true;
}

function mapaVivo_(ctx, d) {
  need_(ctx, 'Delivery', 'Ver');
  if (isDelivery_(ctx)) fail_('El mapa es solo para administración', 'PERM');
  const cfg = config_();
  const hoy = fmtD_(new Date());
  const servicios = readAll_('Servicios_Delivery').filter(function (s) { return ['Asignado', 'Aceptado', 'En camino'].indexOf(s.Estado) >= 0; });
  const ventas = {}; readAll_('Ventas').forEach(function (v) { ventas[v.ID_Venta] = v; });
  const clientes = {}; readAll_('Clientes').forEach(function (c) { clientes[c.ID_Cliente] = c.Nombre; });
  const rastro = {};
  readAll_('Ubicaciones_Delivery').forEach(function (u) {
    if (String(u.Fecha_Hora).slice(0, 10) !== hoy) return;
    const p = parseLL_(u.LatLong);
    if (p) (rastro[u.ID_Delivery] = rastro[u.ID_Delivery] || []).push([p.lat, p.lng]);
  });
  const now = new Date().getTime();
  const reps = readAll_('Deliverys').filter(function (r) { return bool_(r.Activo); }).map(function (r) {
    const pos = parseLL_(r.Ultima_Ubicacion);
    let min = null;
    if (r.Fecha_Ubicacion) { const t = new Date(String(r.Fecha_Ubicacion)).getTime(); if (!isNaN(t)) min = Math.max(0, Math.round((now - t) / 60000)); }
    return {
      ID_Delivery: r.ID_Delivery, Nombre: r.Nombre, Telefono: r.Telefono, Vehiculo: r.Vehiculo, Estado: r.Estado,
      lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, Fecha_Ubicacion: r.Fecha_Ubicacion, hace_min: min,
      ruta: (rastro[r.ID_Delivery] || []).slice(-60),
      servicios: servicios.filter(function (s) { return s.ID_Delivery === r.ID_Delivery; }).map(function (s) {
        const dest = parseLL_(s.Destino_LatLong);
        const v = ventas[s.ID_Venta];
        return { ID_Servicio: s.ID_Servicio, ID_Venta: s.ID_Venta, Estado: s.Estado, Direccion_Entrega: s.Direccion_Entrega,
          dest: dest ? [dest.lat, dest.lng] : null, Cliente: v ? (clientes[v.ID_Cliente] || '') : '' };
      })
    };
  });
  const o = parseLL_(cfg.ORIGEN_LATLONG);
  return { origen: o ? [o.lat, o.lng] : null, repartidores: reps };
}

// ---------- Ventas ----------
function crearVenta_(ctx, d) {
  need_(ctx, 'Ventas', 'Crear');
  const itemsIn = d.items || [];
  if (!itemsIn.length) fail_('La venta no tiene productos');
  const merged = {};
  const notas = {};
  itemsIn.forEach(function (it) {
    const q = num_(it.Cantidad);
    if (!(q > 0)) fail_('Cantidad inválida');
    merged[it.ID_Producto] = (merged[it.ID_Producto] || 0) + q;
    const n = feat_('comanda') ? String(it.Nota || '').trim().slice(0, 120) : '';
    if (n) notas[it.ID_Producto] = notas[it.ID_Producto] ? notas[it.ID_Producto] + ' / ' + n : n;
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cfg = config_();
    const negativo = bool_(cfg.PERMITIR_STOCK_NEGATIVO);
    const productos = {};
    readAll_('Productos').forEach(function (p) { productos[p.ID_Producto] = p; });
    const entrega = ['Delivery', 'Para servir'].indexOf(d.tipoEntrega) >= 0 ? d.tipoEntrega : 'Retiro en local';
    if (d.ID_Cliente && !findBy_('Clientes', 'ID_Cliente', d.ID_Cliente)) fail_('El cliente no existe');
    if (entrega === 'Delivery') {
      if (!d.delivery || !d.delivery.ID_Delivery) fail_('Selecciona el delivery');
      if (!findBy_('Deliverys', 'ID_Delivery', d.delivery.ID_Delivery)) fail_('El delivery no existe');
    }
    const now = new Date();
    const fh = fmtDT_(now);
    const fecha = fmtD_(now);
    const idVenta = 'V' + pad_(nextNum_('venta'), 6);
    let subtotal = 0;
    const detalle = [];
    const movs = [];
    const updates = [];
    const ids = Object.keys(merged);
    ids.forEach(function (id) {
      const p = productos[id];
      if (!p) fail_('Producto no existe: ' + id);
      if (!bool_(p.Activo)) fail_('El producto "' + p.Nombre + '" está desactivado');
      const qty = merged[id];
      const stock = num_(p.Stock_Actual);
      if (qty > stock && !negativo) fail_('Stock insuficiente de "' + p.Nombre + '" (disponible: ' + stock + ')');
      const precio = num_(p.Precio_Venta);
      const sub = round2_(qty * precio);
      subtotal += sub;
      detalle.push({
        ID_Detalle: newId_('DV'), ID_Venta: idVenta, ID_Producto: id, Nombre_Producto: p.Nombre,
        ID_Categoria: p.ID_Categoria, Cantidad: qty, Precio_Unitario: precio, Costo_Unitario: num_(p.Precio_Compra),
        Descuento: 0, Subtotal: sub, Fecha: fecha,
        Nota: notas[id] || '', Va_A_Cocina: String(p.Va_A_Cocina).toUpperCase() !== 'FALSE'
      });
      const nuevo = stock - qty;
      updates.push({ p: p, nuevo: nuevo });
      movs.push({
        ID_Mov: newId_('M'), Fecha: fh, ID_Producto: id, Tipo: 'Salida venta', Cantidad: qty,
        Stock_Antes: stock, Stock_Despues: nuevo, Referencia: idVenta, Usuario: ctx.user.Email, Nota: ''
      });
    });
    subtotal = round2_(subtotal);
    const descuento = round2_(Math.max(0, num_(d.descuento)));
    if (descuento > subtotal) fail_('El descuento no puede superar el subtotal');
    let costoDelivery = 0;
    if (entrega === 'Delivery') costoDelivery = round2_(Math.max(0, num_(d.delivery.Monto_Delivery)));
    const total = round2_(subtotal - descuento + costoDelivery);
    const tipoDoc = ['Ticket', 'Boleta', 'Factura'].indexOf(d.tipoDocumento) >= 0 ? d.tipoDocumento : 'Ticket';
    const venta = {
      ID_Venta: idVenta, Fecha_Hora: fh, ID_Cliente: d.ID_Cliente || '', Tipo_Entrega: entrega,
      Subtotal: subtotal, Descuento: descuento, Costo_Delivery: costoDelivery, Total: total,
      Metodo_Pago: d.metodoPago || 'Efectivo', Estado_Pago: d.estadoPago || 'Pagado',
      Estado: entrega === 'Delivery' ? 'En despacho' : 'Confirmada', Tipo_Documento: tipoDoc,
      Dia_Semana: DIAS[Number(Utilities.formatDate(now, tz_(), 'u')) % 7], Usuario: ctx.user.Email,
      Referencia: feat_('comanda') ? String(d.referencia || '').trim().slice(0, 60) : '', Nota_Cocina: feat_('comanda') ? String(d.notaCocina || '').trim().slice(0, 200) : ''
    };
    insert_('Ventas', venta);
    detalle.forEach(function (r) { insert_('Detalle_Venta', r); });
    updates.forEach(function (u) { update_('Productos', u.p._row, { Stock_Actual: u.nuevo }); });
    movs.forEach(function (m) { insert_('Movimientos_Inventario', m); });
    updates.forEach(function (u) { stockAlert_(u.p, u.nuevo); });
    let servicio = null;
    if (entrega === 'Delivery') {
      const dl = findBy_('Deliverys', 'ID_Delivery', d.delivery.ID_Delivery);
      const cli = d.ID_Cliente ? findBy_('Clientes', 'ID_Cliente', d.ID_Cliente) : null;
      servicio = {
        ID_Servicio: 'S' + pad_(nextNum_('servicio'), 6), ID_Venta: idVenta, ID_Delivery: dl.ID_Delivery,
        Nombre_Delivery: dl.Nombre, Fecha_Asignacion: fh, Fecha_Aceptado: '', Fecha_Finalizado: '', Fecha: fecha,
        Direccion_Entrega: d.delivery.Direccion_Entrega || (cli ? cli.Direccion : ''),
        Destino_LatLong: d.delivery.Destino_LatLong || (cli ? cli.Ubicacion : ''),
        Origen_LatLong: cfg.ORIGEN_LATLONG || '', Distancia_Km: num_(d.delivery.Distancia_Km),
        Tiempo_Min: num_(d.delivery.Tiempo_Min), Monto_Delivery: costoDelivery, Estado: 'Asignado',
        Notas: d.delivery.Notas || '', Usuario_Asigna: ctx.user.Email
      };
      insert_('Servicios_Delivery', servicio);
    }
    // Documento interno (ticket / comprobante)
    const imp = num_(cfg.IMPUESTO_PORC);
    const neto = imp > 0 ? round2_(total / (1 + imp)) : total;
    const documento = {
      ID_Documento: newId_('DOC'), ID_Venta: idVenta, Tipo: tipoDoc,
      Folio: String(nextNum_('doc_' + tipoDoc)), Fecha: fh, Neto: neto, Impuesto: round2_(total - neto), Total: total,
      Formato: d.formato || cfg.FORMATO_DOC_DEFECTO || 'Termica 80mm', PDF_URL: ''
    };
    insert_('Documentos', documento);
    audit_(ctx, 'Ventas', 'Crear', idVenta, 'Total ' + total);
    const cliente = d.ID_Cliente ? cleanRow_('Clientes', findBy_('Clientes', 'ID_Cliente', d.ID_Cliente)) : null;
    return { venta: venta, detalle: detalle, servicio: servicio, documento: documento, cliente: cliente };
  } finally { lock.releaseLock(); }
}

function anularVenta_(ctx, d) {
  need_(ctx, 'Ventas', 'Eliminar');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const v = findBy_('Ventas', 'ID_Venta', d.ID_Venta);
    if (!v) fail_('Venta no encontrada');
    if (v.Estado === 'Anulada') fail_('La venta ya está anulada');
    const productos = {};
    readAll_('Productos').forEach(function (p) { productos[p.ID_Producto] = p; });
    const fh = fmtDT_(new Date());
    readAll_('Detalle_Venta').filter(function (r) { return r.ID_Venta === d.ID_Venta; }).forEach(function (r) {
      const p = productos[r.ID_Producto];
      if (!p) return;
      const antes = num_(p.Stock_Actual);
      const despues = antes + num_(r.Cantidad);
      update_('Productos', p._row, { Stock_Actual: despues });
      p.Stock_Actual = despues;
      insert_('Movimientos_Inventario', {
        ID_Mov: newId_('M'), Fecha: fh, ID_Producto: r.ID_Producto, Tipo: 'Anulacion venta', Cantidad: num_(r.Cantidad),
        Stock_Antes: antes, Stock_Despues: despues, Referencia: d.ID_Venta, Usuario: ctx.user.Email, Nota: d.motivo || ''
      });
    });
    update_('Ventas', v._row, { Estado: 'Anulada' });
    readAll_('Servicios_Delivery').filter(function (s) { return s.ID_Venta === d.ID_Venta && s.Estado !== 'Finalizado'; })
      .forEach(function (s) { update_('Servicios_Delivery', s._row, { Estado: 'Cancelado' }); });
    audit_(ctx, 'Ventas', 'Eliminar', d.ID_Venta, 'Venta anulada. ' + (d.motivo || ''));
    return true;
  } finally { lock.releaseLock(); }
}

function listarVentas_(ctx, d) {
  if (isDelivery_(ctx) || (!can_(ctx, 'Ventas', 'Ver') && !can_(ctx, 'Historial', 'Ver'))) fail_('No tienes permiso para ver ventas', 'PERM');
  const desde = d.desde || '0000-00-00';
  const hasta = d.hasta || '9999-99-99';
  const clientes = {};
  readAll_('Clientes').forEach(function (c) { clientes[c.ID_Cliente] = c.Nombre; });
  const rows = readAll_('Ventas').filter(function (v) {
    const f = String(v.Fecha_Hora).slice(0, 10);
    return f >= desde && f <= hasta && (!d.estado || v.Estado === d.estado);
  }).map(function (v) {
    const o = cleanRow_('Ventas', v);
    o.Cliente = clientes[v.ID_Cliente] || '';
    return o;
  });
  rows.sort(function (a, b) { return a.Fecha_Hora < b.Fecha_Hora ? 1 : -1; });
  const validas = rows.filter(function (r) { return r.Estado !== 'Anulada'; });
  return { rows: rows, total: round2_(validas.reduce(function (s, r) { return s + num_(r.Total); }, 0)), cantidad: validas.length };
}

function detalleVenta_(ctx, d) {
  if (isDelivery_(ctx) || (!can_(ctx, 'Ventas', 'Ver') && !can_(ctx, 'Historial', 'Ver'))) fail_('No tienes permiso para ver ventas', 'PERM');
  const v = findBy_('Ventas', 'ID_Venta', d.ID_Venta);
  if (!v) fail_('Venta no encontrada');
  const cli = v.ID_Cliente ? findBy_('Clientes', 'ID_Cliente', v.ID_Cliente) : null;
  return {
    venta: cleanRow_('Ventas', v),
    detalle: readAll_('Detalle_Venta').filter(function (r) { return r.ID_Venta === d.ID_Venta; }).map(function (r) { return cleanRow_('Detalle_Venta', r); }),
    documento: (readAll_('Documentos').filter(function (r) { return r.ID_Venta === d.ID_Venta; }).map(function (r) { return cleanRow_('Documentos', r); }))[0] || null,
    cliente: cli ? cleanRow_('Clientes', cli) : null
  };
}

// ---------- Delivery ----------
function misServicios_(ctx, d) {
  need_(ctx, 'Delivery', 'Ver');
  const own = isDelivery_(ctx);
  let rows = readAll_('Servicios_Delivery');
  if (own) rows = rows.filter(function (s) { return s.ID_Delivery === ctx.user.ID_Delivery; });
  if (d.estados && d.estados.length) rows = rows.filter(function (s) { return d.estados.indexOf(s.Estado) >= 0; });
  const detalle = readAll_('Detalle_Venta');
  const ventas = {}; readAll_('Ventas').forEach(function (v) { ventas[v.ID_Venta] = v; });
  const clientes = {}; readAll_('Clientes').forEach(function (c) { clientes[c.ID_Cliente] = c; });
  const out = rows.map(function (s) {
    const o = cleanRow_('Servicios_Delivery', s);
    const v = ventas[s.ID_Venta];
    const c = v ? clientes[v.ID_Cliente] : null;
    o.items = detalle.filter(function (r) { return r.ID_Venta === s.ID_Venta; })
      .map(function (r) { return { Nombre: r.Nombre_Producto, Cantidad: r.Cantidad }; });
    o.Cliente = c ? c.Nombre : '';
    o.Cliente_Telefono = c ? c.Telefono : '';
    o.Total_Venta = v ? v.Total : 0;
    o.Estado_Pago = v ? v.Estado_Pago : '';
    return o;
  });
  out.sort(function (a, b) { return a.Fecha_Asignacion < b.Fecha_Asignacion ? 1 : -1; });
  return out;
}

function servicioEstado_(ctx, d) {
  need_(ctx, 'Delivery', 'Ver');
  const s = findBy_('Servicios_Delivery', 'ID_Servicio', d.ID_Servicio);
  if (!s) fail_('Servicio no encontrado');
  const estado = d.estado;
  const validos = ['Aceptado', 'En camino', 'Finalizado', 'Rechazado', 'Cancelado', 'Asignado'];
  if (validos.indexOf(estado) < 0) fail_('Estado inválido');
  if (isDelivery_(ctx)) {
    if (s.ID_Delivery !== ctx.user.ID_Delivery) fail_('Este servicio no es tuyo', 'PERM');
    if (['Aceptado', 'En camino', 'Finalizado', 'Rechazado'].indexOf(estado) < 0) fail_('Acción no permitida', 'PERM');
  } else {
    need_(ctx, 'Delivery', 'Editar');
  }
  if (s.Estado === 'Finalizado' || s.Estado === 'Cancelado') fail_('El servicio ya está cerrado');
  const patch = { Estado: estado };
  const fh = fmtDT_(new Date());
  if (estado === 'Aceptado') patch.Fecha_Aceptado = fh;
  if (estado === 'Finalizado') {
    patch.Fecha_Finalizado = fh;
    if (d.Distancia_Km !== undefined && d.Distancia_Km !== '') patch.Distancia_Km = num_(d.Distancia_Km);
    if (d.Tiempo_Min !== undefined && d.Tiempo_Min !== '') patch.Tiempo_Min = num_(d.Tiempo_Min);
  }
  update_('Servicios_Delivery', s._row, patch);
  if (estado === 'Finalizado' || estado === 'Rechazado') {
    insert_('Alertas', {
      ID_Alerta: newId_('A'), Fecha: fh, Tipo: estado === 'Finalizado' ? 'Delivery finalizado' : 'Delivery rechazado',
      Referencia: s.ID_Servicio,
      Mensaje: s.Nombre_Delivery + (estado === 'Finalizado' ? ' finalizó' : ' rechazó') + ' el pedido ' + s.ID_Venta + ' (' + s.Direccion_Entrega + ')',
      Para_Rol: 'R01,R02', Leida: false
    });
  }
  if (estado === 'Finalizado') {
    const v = findBy_('Ventas', 'ID_Venta', s.ID_Venta);
    if (v && v.Estado !== 'Anulada') update_('Ventas', v._row, { Estado: 'Entregada' });
  }
  audit_(ctx, 'Delivery', 'Editar', s.ID_Servicio, 'Estado → ' + estado);
  return true;
}

function historialDelivery_(ctx, d) {
  if (!can_(ctx, 'Historial', 'Ver') && !can_(ctx, 'Delivery', 'Ver')) fail_('No tienes permiso para ver el historial', 'PERM');
  const desde = d.desde || '0000-00-00';
  const hasta = d.hasta || '9999-99-99';
  const q = String(d.nombre || '').trim().toLowerCase();
  let idDel = d.ID_Delivery || '';
  if (isDelivery_(ctx)) idDel = ctx.user.ID_Delivery;
  const rows = readAll_('Servicios_Delivery').filter(function (s) {
    const f = String(s.Fecha).slice(0, 10);
    if (f < desde || f > hasta) return false;
    if (idDel && s.ID_Delivery !== idDel) return false;
    if (q && String(s.Nombre_Delivery).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).map(function (s) { return cleanRow_('Servicios_Delivery', s); });
  rows.sort(function (a, b) { return a.Fecha_Asignacion < b.Fecha_Asignacion ? 1 : -1; });
  const contables = rows.filter(function (r) { return r.Estado === 'Finalizado'; });
  return {
    rows: rows,
    total: round2_(contables.reduce(function (s, r) { return s + num_(r.Monto_Delivery); }, 0)),
    km: round2_(contables.reduce(function (s, r) { return s + num_(r.Distancia_Km); }, 0)),
    servicios: contables.length
  };
}

// ---------- KPI ----------
function kpi_(ctx, d) {
  need_(ctx, 'KPI', 'Ver');
  const desde = d.desde || '0000-00-00';
  const hasta = d.hasta || '9999-99-99';
  const ventas = readAll_('Ventas').filter(function (v) {
    const f = String(v.Fecha_Hora).slice(0, 10);
    return v.Estado !== 'Anulada' && f >= desde && f <= hasta;
  });
  const idsValidos = {};
  ventas.forEach(function (v) { idsValidos[v.ID_Venta] = v; });
  const total = ventas.reduce(function (s, v) { return s + num_(v.Total); }, 0);
  const porDia = {}; DIAS.forEach(function (n) { porDia[n] = { dia: n, ventas: 0, monto: 0 }; });
  const porHora = {};
  ventas.forEach(function (v) {
    const dt = new Date(String(v.Fecha_Hora));
    const nombre = v.Dia_Semana || DIAS[dt.getDay()];
    if (porDia[nombre]) { porDia[nombre].ventas++; porDia[nombre].monto += num_(v.Total); }
    const h = String(v.Fecha_Hora).slice(11, 13);
    porHora[h] = (porHora[h] || 0) + 1;
  });
  const prod = {}; const cat = {}; let margen = 0;
  readAll_('Detalle_Venta').forEach(function (r) {
    if (!idsValidos[r.ID_Venta]) return;
    const p = prod[r.ID_Producto] || (prod[r.ID_Producto] = { nombre: r.Nombre_Producto, cantidad: 0, monto: 0 });
    p.cantidad += num_(r.Cantidad); p.monto += num_(r.Subtotal);
    cat[r.ID_Categoria] = (cat[r.ID_Categoria] || 0) + num_(r.Subtotal);
    margen += num_(r.Subtotal) - num_(r.Costo_Unitario) * num_(r.Cantidad);
  });
  const catNames = {}; readAll_('Categorias').forEach(function (c) { catNames[c.ID_Categoria] = c.Nombre; });
  const top = Object.keys(prod).map(function (k) { return prod[k]; }).sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 10);
  const porCategoria = Object.keys(cat).map(function (k) { return { categoria: catNames[k] || 'Sin categoría', monto: round2_(cat[k]) }; })
    .sort(function (a, b) { return b.monto - a.monto; });
  const del = {};
  readAll_('Servicios_Delivery').forEach(function (s) {
    const f = String(s.Fecha).slice(0, 10);
    if (s.Estado !== 'Finalizado' || f < desde || f > hasta) return;
    const o = del[s.Nombre_Delivery] || (del[s.Nombre_Delivery] = { nombre: s.Nombre_Delivery, servicios: 0, monto: 0, km: 0 });
    o.servicios++; o.monto += num_(s.Monto_Delivery); o.km += num_(s.Distancia_Km);
  });
  const bajoStock = readAll_('Productos').filter(function (p) { return bool_(p.Activo) && num_(p.Stock_Actual) <= num_(p.Stock_Minimo); })
    .map(function (p) { return { nombre: p.Nombre, stock: num_(p.Stock_Actual), minimo: num_(p.Stock_Minimo) }; });
  return {
    ventas: ventas.length, total: round2_(total), ticketPromedio: ventas.length ? round2_(total / ventas.length) : 0,
    margen: round2_(margen),
    topProductos: top.map(function (p) { return { nombre: p.nombre, cantidad: round2_(p.cantidad), monto: round2_(p.monto) }; }),
    porDia: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map(function (n) { return { dia: n, ventas: porDia[n].ventas, monto: round2_(porDia[n].monto) }; }),
    porHora: Object.keys(porHora).sort().map(function (h) { return { hora: h + ':00', ventas: porHora[h] }; }),
    porCategoria: porCategoria,
    delivery: Object.keys(del).map(function (k) { return { nombre: del[k].nombre, servicios: del[k].servicios, monto: round2_(del[k].monto), km: round2_(del[k].km) }; }),
    bajoStock: bajoStock
  };
}

// ---------- Archivos (imágenes, logo, PDF) ----------
function driveFolder_() {
  const it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function subirArchivo_(ctx, d) {
  const modulo = d.modulo || 'Inventario';
  if (MODULES.indexOf(modulo) < 0) fail_('Módulo inválido');
  if (!can_(ctx, modulo, 'Crear') && !can_(ctx, modulo, 'Editar')) fail_('No tienes permiso para subir archivos en ' + modulo, 'PERM');
  const mime = String(d.mime || '');
  const permitidos = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
  if (permitidos.indexOf(mime) < 0) fail_('Tipo de archivo no permitido');
  if (!d.base64 || d.base64.length > 8 * 1024 * 1024) fail_('Archivo vacío o demasiado grande (máx. ~6 MB)');
  const blob = Utilities.newBlob(Utilities.base64Decode(d.base64), mime, String(d.nombre || 'archivo').replace(/[^\w.\- ]/g, '_'));
  const file = driveFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = file.getId();
  audit_(ctx, modulo, 'Crear', id, 'Archivo ' + file.getName());
  return {
    id: id,
    url: mime === 'application/pdf' ? 'https://drive.google.com/file/d/' + id + '/view' : 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800'
  };
}

function guardarConfig_(ctx, d) {
  need_(ctx, 'Configuracion', 'Editar');
  const cambios = d.valores || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    Object.keys(cambios).forEach(function (k) {
      const cur = findBy_('Configuracion', 'Clave', k);
      if (cur) update_('Configuracion', cur._row, { Valor: cambios[k] });
      else insert_('Configuracion', { Clave: k, Valor: cambios[k], Descripcion: '' });
    });
  } finally { lock.releaseLock(); }
  audit_(ctx, 'Configuracion', 'Editar', '', Object.keys(cambios).join(', '));
  return config_();
}

// ---------- Usuarios y permisos ----------
function usuariosCrear_(ctx, d) {
  need_(ctx, 'Usuarios', 'Crear');
  const email = String(d.Email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail_('Correo inválido');
  if (!d.Nombre) fail_('Falta el nombre');
  checkPassword_(d.password);
  if (!findBy_('Roles', 'ID_Rol', d.ID_Rol)) fail_('Rol inválido');
  if (d.ID_Rol === MASTER_ROLE && !isMaster_(ctx)) fail_('Solo un Master puede crear otro Master', 'PERM');
  if (readAll_('Usuarios').some(function (u) { return String(u.Email).trim().toLowerCase() === email; })) fail_('Ya existe un usuario con ese correo');
  const tope = licencia_().maxUsuarios;
  if (tope > 0 && readAll_('Usuarios').filter(function (u) { return String(u.Activo).toUpperCase() !== 'FALSE'; }).length >= tope) fail_('Tu plan permite hasta ' + tope + ' usuarios activos. Consulta a tu proveedor para ampliarlo.', 'PLAN');
  const salt = Utilities.getUuid();
  const row = {
    ID_Usuario: newId_('U'), Email: email, Nombre: d.Nombre, Telefono: d.Telefono || '', ID_Rol: d.ID_Rol,
    ID_Delivery: d.ID_Delivery || '', Activo: true, Password_Hash: hash_(String(d.password), salt), Salt: salt,
    Ultimo_Login: '', Fecha_Creacion: fmtDT_(new Date())
  };
  insert_('Usuarios', row);
  audit_(ctx, 'Usuarios', 'Crear', row.ID_Usuario, email);
  return { ID_Usuario: row.ID_Usuario };
}

function usuariosActualizar_(ctx, d) {
  need_(ctx, 'Usuarios', 'Editar');
  const u = findBy_('Usuarios', 'ID_Usuario', d.ID_Usuario);
  if (!u) fail_('Usuario no encontrado');
  const patch = {};
  ['Nombre', 'Telefono', 'ID_Delivery'].forEach(function (c) { if (d[c] !== undefined) patch[c] = d[c]; });
  if (d.ID_Rol !== undefined) {
    if (!findBy_('Roles', 'ID_Rol', d.ID_Rol)) fail_('Rol inválido');
    if ((d.ID_Rol === MASTER_ROLE || u.ID_Rol === MASTER_ROLE) && !isMaster_(ctx)) fail_('Solo un Master puede cambiar este rol', 'PERM');
    patch.ID_Rol = d.ID_Rol;
  }
  if (d.Activo !== undefined) {
    if (u.ID_Usuario === ctx.user.ID_Usuario && !d.Activo) fail_('No puedes deshabilitarte a ti mismo');
    if (d.Activo && String(u.Activo).toUpperCase() === 'FALSE') {
      const tope = licencia_().maxUsuarios;
      if (tope > 0 && readAll_('Usuarios').filter(function (x) { return String(x.Activo).toUpperCase() !== 'FALSE'; }).length >= tope) fail_('Tu plan permite hasta ' + tope + ' usuarios activos. Consulta a tu proveedor para ampliarlo.', 'PLAN');
    }
    patch.Activo = !!d.Activo;
  }
  update_('Usuarios', u._row, patch);
  ctxBump_();
  audit_(ctx, 'Usuarios', 'Editar', u.ID_Usuario, JSON.stringify(Object.keys(patch)));
  return true;
}

function usuariosPassword_(ctx, d) {
  need_(ctx, 'Usuarios', 'Editar');
  const u = findBy_('Usuarios', 'ID_Usuario', d.ID_Usuario);
  if (!u) fail_('Usuario no encontrado');
  if (u.ID_Rol === MASTER_ROLE && !isMaster_(ctx)) fail_('Solo un Master puede cambiar esta contraseña', 'PERM');
  checkPassword_(d.password);
  const salt = Utilities.getUuid();
  update_('Usuarios', u._row, { Salt: salt, Password_Hash: hash_(String(d.password), salt) });
  audit_(ctx, 'Usuarios', 'Editar', u.ID_Usuario, 'Contraseña restablecida');
  return true;
}

// Guarda la matriz completa de permisos de un rol o de un usuario
function permisosGuardar_(ctx, d) {
  if (!isMaster_(ctx)) fail_('Solo el Master puede modificar permisos', 'PERM');
  const porUsuario = !!d.ID_Usuario;
  const tabla = porUsuario ? 'Permisos_Usuario' : 'Permisos';
  if (!porUsuario && d.ID_Rol === MASTER_ROLE) fail_('El rol Master siempre tiene todos los permisos');
  if (!porUsuario && !findBy_('Roles', 'ID_Rol', d.ID_Rol)) fail_('Rol inválido');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const existentes = readAll_(tabla);
    (d.matriz || []).forEach(function (m) {
      if (MODULES.indexOf(m.Modulo) < 0) return;
      const vals = {};
      ACTIONS_LIST.forEach(function (a) { vals[a] = !!m[a]; });
      let cur = null;
      for (let i = 0; i < existentes.length; i++) {
        const r = existentes[i];
        if (r.Modulo === m.Modulo && (porUsuario ? r.ID_Usuario === d.ID_Usuario : r.ID_Rol === d.ID_Rol)) { cur = r; break; }
      }
      if (cur) update_(tabla, cur._row, vals);
      else if (porUsuario) insert_(tabla, Object.assign({ ID_PermU: newId_('PU'), ID_Usuario: d.ID_Usuario, Modulo: m.Modulo }, vals));
      else insert_(tabla, Object.assign({ ID_Permiso: d.ID_Rol + '-' + m.Modulo, ID_Rol: d.ID_Rol, Modulo: m.Modulo }, vals));
    });
  } finally { lock.releaseLock(); }
  ctxBump_();
  audit_(ctx, 'Usuarios', 'Editar', d.ID_Usuario || d.ID_Rol, 'Permisos actualizados');
  return true;
}

// ---------- Exportar a Excel (los datos; el archivo lo arma la app) ----------
function exportar_(ctx, d) {
  need_(ctx, 'Reportes', 'Exportar');
  const permitidas = { Productos: 'Inventario', Categorias: 'Categorias', Clientes: 'Clientes', Proveedores: 'Proveedores',
    Ventas: 'Ventas', Detalle_Venta: 'Ventas', Servicios_Delivery: 'Delivery', Movimientos_Inventario: 'Inventario',
    Deliverys: 'Delivery', Compras: 'Proveedores' };
  const out = {};
  (d.hojas || []).forEach(function (h) {
    if (!permitidas[h]) return;
    if (!can_(ctx, permitidas[h], 'Ver')) return;
    out[h] = readAll_(h).map(function (r) { return cleanRow_(h, r); });
  });
  audit_(ctx, 'Reportes', 'Exportar', '', Object.keys(out).join(', '));
  return out;
}

// ---------- Suscripción / licencia (se consulta al servidor de licencias del proveedor) ----------
function parseFecha_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return undefined;
}

function licenciaRefrescar_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('lic_force')) return;          // máximo 1 refresco cada 30 s
  cache.put('lic_force', '1', 30);
  cache.remove('lic_v1');
}

function licenciaRemota_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('lic_v1');
  if (c) return JSON.parse(c);
  const props = PropertiesService.getScriptProperties();
  const sep = LICENCIA_URL.indexOf('?') >= 0 ? '&' : '?';
  let j = null, falla = '';
  try {
    const res = UrlFetchApp.fetch(LICENCIA_URL + sep + 'k=' + encodeURIComponent(LICENCIA_ID), { muteHttpExceptions: true, followRedirects: true });
    j = JSON.parse(res.getContentText());
  } catch (e) { falla = String(e.message || e); }
  if (j && j.ok) {
    j.verificado = Date.now();
    props.setProperty('lic_last', JSON.stringify(j));
    cache.put('lic_v1', JSON.stringify(j), 300);
    return j;
  }
  const last = props.getProperty('lic_last');
  const prev = last ? JSON.parse(last) : null;
  if (j && !j.ok) {                              // el servidor respondió que NO (clave inexistente, etc.): bloquear ya
    const r = { error: j.error || 'Licencia no válida', invalida: true, whatsapp: prev ? prev.whatsapp : '', plan: prev ? prev.plan : '' };
    cache.put('lic_v1', JSON.stringify(r), 60);
    return r;
  }
  if (prev && Date.now() - prev.verificado < 72 * 3600 * 1000) {   // sin internet/servidor caído: gracia de 72 h con el último dato bueno
    prev.sinConexion = true;
    cache.put('lic_v1', JSON.stringify(prev), 60);
    return prev;
  }
  return { error: falla || 'Sin respuesta del servidor de licencias', whatsapp: prev ? prev.whatsapp : '', plan: prev ? prev.plan : '' };
}

// Devuelve el estado de la licencia: activo | por_vencer | vencido | suspendido | sin_vencimiento | error | sin_control
function licencia_() {
  const base = { plan: '', vencimiento: '', diasRestantes: null, whatsapp: '', bloqueada: false, estado: 'sin_control', mensaje: '', funciones: null, maxUsuarios: 0 };
  if (!LICENCIA_URL) return base;
  const r = licenciaRemota_();
  base.plan = r.plan || '';
  base.funciones = Array.isArray(r.funciones) ? r.funciones : null;   // null = todas (servidor de licencias antiguo)
  base.maxUsuarios = Number(r.maxUsuarios) || 0;
  base.whatsapp = String(r.whatsapp || '').replace(/\D/g, '');
  if (r.error) {
    base.estado = 'error'; base.bloqueada = true;
    base.mensaje = r.invalida ? 'La licencia de este sistema no es válida. Contacta a tu proveedor.' : 'No se pudo verificar la licencia. Intenta de nuevo en unos minutos.';
    return base;
  }
  if (r.activo === false) {
    base.estado = 'suspendido'; base.bloqueada = true;
    base.mensaje = 'El servicio está suspendido. Contacta a tu proveedor para reactivarlo.';
    return base;
  }
  const f = parseFecha_(r.vencimiento);
  if (f === null) { base.estado = 'sin_vencimiento'; return base; }
  if (f === undefined) { base.estado = 'error'; base.bloqueada = true; base.mensaje = 'La fecha de vencimiento de la licencia no es válida. Contacta a tu proveedor.'; return base; }
  const hoy = fmtD_(new Date()).split('-');
  const dias = Math.round((Date.UTC(f.y, f.m - 1, f.d) - Date.UTC(+hoy[0], +hoy[1] - 1, +hoy[2])) / 86400000);
  base.vencimiento = f.y + '-' + pad_(f.m, 2) + '-' + pad_(f.d, 2);
  base.diasRestantes = dias;
  if (dias < 0) {
    base.estado = 'vencido'; base.bloqueada = true;
    base.mensaje = 'Tu suscripción venció el ' + pad_(f.d, 2) + '-' + pad_(f.m, 2) + '-' + f.y + '. Contacta a tu proveedor para renovarla.';
  } else base.estado = dias <= 7 ? 'por_vencer' : 'activo';
  return base;
}

// Lo único que se muestra sin iniciar sesión (solo si está bloqueada)
function licenciaPublica_(l) {
  if (!l.bloqueada) return { bloqueada: false };
  return { bloqueada: true, estado: l.estado, mensaje: l.mensaje, plan: l.plan, vencimiento: l.vencimiento, whatsapp: l.whatsapp };
}

// ---------- Funciones habilitadas por el plan ----------
function funciones_() { return licencia_().funciones; }          // null = todas
function feat_(f) { const fs = funciones_(); return !fs || fs.indexOf(f) >= 0; }
function needFeat_(f) { if (!feat_(f)) fail_('Esta función no está incluida en tu plan. Consulta a tu proveedor para activarla.', 'PLAN'); }

const ACCION_FUNCION = {
  crearCompra: 'compras', recibirCompra: 'compras', anularCompra: 'compras', listarCompras: 'compras',
  ubicacion: 'mapa', mapaVivo: 'mapa',
  misServicios: 'delivery', servicioEstado: 'delivery', historialDelivery: 'delivery',
  kpi: 'kpi', exportar: 'reportes'
};
const TABLA_FUNCION = {
  Proveedores: 'compras', Visitas_Proveedor: 'compras', Compras: 'compras', Detalle_Compra: 'compras',
  Deliverys: 'delivery', Servicios_Delivery: 'delivery', Ubicaciones_Delivery: 'delivery',
  Categorias_Conocimiento: 'conocimiento', Conocimiento: 'conocimiento'
};
function checkFunciones_(a, d) {
  if (ACCION_FUNCION[a]) needFeat_(ACCION_FUNCION[a]);
  if (a === 'crearVenta' && d && d.tipoEntrega === 'Delivery') needFeat_('delivery');
  if (['listar', 'crear', 'actualizar', 'eliminar'].indexOf(a) >= 0 && d && TABLA_FUNCION[d.tabla]) needFeat_(TABLA_FUNCION[d.tabla]);
}

function suscripcion_(ctx, d) {
  if (!isMaster_(ctx)) fail_('Solo el Master puede ver la suscripción', 'PERM');
  const l = licencia_();
  return { funciones: l.funciones, maxUsuarios: l.maxUsuarios, plan: l.plan, whatsapp: l.whatsapp, vencimiento: l.vencimiento, diasRestantes: l.diasRestantes, estado: l.estado };
}
