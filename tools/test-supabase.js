// Pruebas propias del modelo Supabase: varios negocios, prueba gratis, planes y seguridad.
// (La lógica de negocio completa se prueba con:  BACKEND=pg node tools/test-backend.js)
const { createRuntime } = require('./pg-runtime');
const assert = require('assert');
const rt = createRuntime();
const ok = (r) => { if (!r.ok) throw new Error('Esperaba ok: ' + r.error + ' ' + r.code); return r.data; };
const bad = (r, txt, code) => { assert.strictEqual(r.ok, false, 'Esperaba error'); if (txt) assert(r.error.includes(txt), `Error "${r.error}" no contiene "${txt}"`); if (code) assert.strictEqual(r.code, code); return r; };
const reg = (negocio, email, extra = {}) => rt.call('registrar', Object.assign({ negocio, nombre: 'Dueño ' + negocio, email, password: 'Clave12345' }, extra));

// --- Registro ---
bad(reg('', 'a@x.com'), 'nombre de tu negocio');
bad(reg('Burger 818', 'no-es-correo'), 'Correo inválido');
bad(reg('Burger 818', 'a@x.com', { password: 'corta' }), '8 caracteres');
const A = ok(reg('Burger 818', 'a@burger.cl'));
assert.strictEqual(A.codigo, 'burger818');
assert(A.perms.Inventario.Eliminar && A.user.ID_Rol === 'R01');
bad(reg('Otro', 'A@burger.cl'), 'Ya existe una cuenta', '');
const B = ok(reg('Pastelería Ñandú', 'b@pasteles.cl'));
assert.strictEqual(B.codigo, 'pastelerianandu');
ok(reg('Burger 818', 'c@otro.cl'));            // mismo nombre: el código se diferencia solo
assert.notStrictEqual(ok(rt.call('publico', { negocio: 'burger818' })).NOMBRE_NEGOCIO, undefined);
assert.strictEqual(ok(rt.call('publico', { negocio: 'pastelerianandu' })).NOMBRE_NEGOCIO, 'Pastelería Ñandú');
assert.strictEqual(ok(rt.call('publico', { negocio: 'noexiste' })).NOMBRE_NEGOCIO, 'App Negocio');

// --- Prueba gratis de 15 días con todo activo ---
const sa = ok(rt.call('suscripcion', {}, A.token));
assert.strictEqual(sa.plan, 'PRUEBA'); assert.strictEqual(sa.diasRestantes, 15); assert.strictEqual(sa.funciones.length, 7); assert.strictEqual(sa.maxUsuarios, 8);

// --- Aislamiento entre negocios ---
const pa = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Burger', Precio_Venta: 5000, Stock_Actual: 10, Stock_Minimo: 1, Codigo_Barras: '111' } }, A.token));
const pb = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Torta', Precio_Venta: 9000, Stock_Actual: 3, Stock_Minimo: 1, Codigo_Barras: '111' } }, B.token));  // mismo código de barras en otro negocio: permitido
assert.deepStrictEqual(ok(rt.call('listar', { tabla: 'Productos' }, A.token)).map((x) => x.Nombre), ['Burger']);
assert.deepStrictEqual(ok(rt.call('listar', { tabla: 'Productos' }, B.token)).map((x) => x.Nombre), ['Torta']);
bad(rt.call('actualizar', { tabla: 'Productos', id: pa.ID_Producto, datos: { Nombre: 'Hackeado' } }, B.token), 'no encontrado');
bad(rt.call('eliminar', { tabla: 'Productos', id: pa.ID_Producto }, B.token), 'no encontrado');
bad(rt.call('ajustarStock', { ID_Producto: pa.ID_Producto, tipo: 'Ajuste', nuevoStock: 0 }, B.token), 'no encontrado');
const va = ok(rt.call('crearVenta', { items: [{ ID_Producto: pa.ID_Producto, Cantidad: 2 }] }, A.token));
bad(rt.call('detalleVenta', { ID_Venta: va.venta.ID_Venta }, B.token), 'no encontrada');
bad(rt.call('anularVenta', { ID_Venta: va.venta.ID_Venta }, B.token), 'no encontrada');
bad(rt.call('crearVenta', { items: [{ ID_Producto: pa.ID_Producto, Cantidad: 1 }] }, B.token), 'no existe');   // producto de otro negocio
assert.strictEqual(ok(rt.call('listarVentas', {}, B.token)).rows.length, 0);
assert.strictEqual(ok(rt.call('kpi', {}, B.token)).ventas, 0);
assert.strictEqual(ok(rt.call('kpi', {}, A.token)).ventas, 1);
assert.strictEqual(ok(rt.call('listar', { tabla: 'Usuarios' }, B.token)).length, 1);
// correlativos independientes por negocio
const vb = ok(rt.call('crearVenta', { items: [{ ID_Producto: pb.ID_Producto, Cantidad: 1 }] }, B.token));
assert.strictEqual(vb.venta.ID_Venta, 'V000001'); assert.strictEqual(va.venta.ID_Venta, 'V000001');
assert.strictEqual(vb.documento.Folio, '1');

// --- Sesiones ---
bad(rt.call('listar', { tabla: 'Productos' }, 'token-inventado'), 'expiró', 'AUTH');
ok(rt.call('logout', {}, B.token));
bad(rt.call('listar', { tabla: 'Productos' }, B.token), 'expiró', 'AUTH');
const B2 = ok(rt.call('login', { email: 'b@pasteles.cl', password: 'Clave12345' }));
assert(B2.token && B2.token !== B.token);
rt.sql("update sesiones set expira = now() - interval '1 minute' where token_hash = encode(digest($1, 'sha256'), 'hex')", [B2.token]);
bad(rt.call('listar', { tabla: 'Productos' }, B2.token), 'expiró', 'AUTH');
const B3 = ok(rt.call('login', { email: 'B@PASTELES.CL', password: 'Clave12345' }));      // correo sin importar mayúsculas
// al desactivar a un usuario o cambiarle la clave se cierran sus sesiones
const emp = ok(rt.call('usuariosCrear', { Email: 'emp@pasteles.cl', Nombre: 'Emp', ID_Rol: 'R02', password: 'Empleado123' }, B3.token));
const E = ok(rt.call('login', { email: 'emp@pasteles.cl', password: 'Empleado123' }));
ok(rt.call('usuariosActualizar', { ID_Usuario: emp.ID_Usuario, Activo: false }, B3.token));
bad(rt.call('listar', { tabla: 'Productos' }, E.token), '', 'AUTH');
bad(rt.call('login', { email: 'emp@pasteles.cl', password: 'Empleado123' }), 'incorrectos');
// el mismo correo no se puede usar en otro negocio
bad(rt.call('usuariosCrear', { Email: 'a@burger.cl', Nombre: 'X', ID_Rol: 'R02', password: 'Empleado123' }, B3.token), 'Ya existe un usuario');

// --- Planes y vencimiento (los maneja el proveedor en la tabla "negocios") ---
const setN = (codigo, sets) => rt.sql(`update negocios set ${sets} where codigo = '${codigo}'`);
setN('pastelerianandu', "plan = 'ESENCIAL'");
const noPlan = (r) => bad(r, 'plan', 'PLAN');
noPlan(rt.call('mapaVivo', {}, B3.token)); noPlan(rt.call('listarCompras', {}, B3.token)); noPlan(rt.call('kpi', {}, B3.token));
noPlan(rt.call('listar', { tabla: 'Deliverys' }, B3.token)); noPlan(rt.call('listar', { tabla: 'Proveedores' }, B3.token));
noPlan(rt.call('crearVenta', { tipoEntrega: 'Delivery', items: [] }, B3.token));
ok(rt.call('listar', { tabla: 'Productos' }, B3.token));
assert.deepStrictEqual(ok(rt.call('me', {}, B3.token)).funciones.slice().sort(), ['comanda', 'conocimiento', 'reportes']);
assert.strictEqual(ok(rt.call('me', {}, B3.token)).maxUsuarios, 3);
setN('pastelerianandu', "funciones_extra = '+delivery,+mapa,-comanda'");
ok(rt.call('listar', { tabla: 'Deliverys' }, B3.token)); ok(rt.call('mapaVivo', {}, B3.token));
// la comanda desactivada no guarda referencia ni notas
const vc = ok(rt.call('crearVenta', { referencia: 'Mesa 1', notaCocina: 'x', items: [{ ID_Producto: pb.ID_Producto, Cantidad: 1, Nota: 'sin azúcar' }] }, B3.token));
assert.strictEqual(vc.venta.Referencia, ''); assert.strictEqual(vc.detalle[0].Nota, '');
setN('pastelerianandu', "funciones_extra = '', max_usuarios = 2");        // master + emp(inactivo) -> 1 activo
ok(rt.call('usuariosActualizar', { ID_Usuario: emp.ID_Usuario, Activo: true }, B3.token));   // 2 activos
bad(rt.call('usuariosCrear', { Email: 'otro@pasteles.cl', Nombre: 'O', ID_Rol: 'R02', password: 'Empleado123' }, B3.token), 'hasta 2 usuarios', 'PLAN');
setN('pastelerianandu', "plan = 'PREMIUM', max_usuarios = null");
ok(rt.call('usuariosCrear', { Email: 'otro@pasteles.cl', Nombre: 'O', ID_Rol: 'R02', password: 'Empleado123' }, B3.token));

// vencimiento y suspensión bloquean todo, incluido el inicio de sesión
setN('pastelerianandu', "vencimiento = current_date - 1");
const lic = bad(rt.call('listar', { tabla: 'Productos' }, B3.token), 'venció', 'LICENSE');
assert.strictEqual(lic.licencia.bloqueada, true); assert.strictEqual(lic.licencia.estado, 'vencido'); assert(lic.licencia.whatsapp);
const lg = bad(rt.call('login', { email: 'b@pasteles.cl', password: 'Clave12345' }), 'venció', 'LICENSE');
assert.strictEqual(lg.licencia.bloqueada, true);
bad(rt.call('login', { email: 'b@pasteles.cl', password: 'mala' }), 'incorrectos');          // sin la clave no se revela el estado
assert.strictEqual(ok(rt.call('publico', { negocio: 'pastelerianandu' })).licencia.bloqueada, true);
ok(rt.call('listar', { tabla: 'Productos' }, A.token));                                     // el otro negocio no se afecta
setN('pastelerianandu', "vencimiento = current_date + 30, activo = false");
bad(rt.call('listar', { tabla: 'Productos' }, B3.token), 'suspendido', 'LICENSE');
setN('pastelerianandu', "activo = true");
ok(rt.call('listar', { tabla: 'Productos' }, B3.token));
setN('pastelerianandu', "vencimiento = current_date + 3");
assert.strictEqual(ok(rt.call('suscripcion', {}, B3.token)).estado, 'por_vencer');

// --- Seguridad ---
bad(rt.call('listar', { tabla: 'Productos"; drop table "Productos"; --' }, A.token), 'Tabla desconocida');
bad(rt.call('listar', { tabla: 'negocios' }, A.token), 'Tabla desconocida');
bad(rt.call('listar', { tabla: 'sesiones' }, A.token), 'Tabla desconocida');
bad(rt.call('hackear', {}, A.token), 'Acción desconocida');
bad(rt.call('crear', { tabla: 'Usuarios', datos: { Email: 'x@x.cl' } }, A.token), 'No se puede crear');
const raro = ok(rt.call('crear', { tabla: 'Clientes', datos: { Nombre: "O'Brien; drop table x; --", tenant_id: '00000000-0000-0000-0000-000000000000', ColumnaInventada: 1 } }, A.token));
assert.strictEqual(raro.Nombre, "O'Brien; drop table x; --");
assert.strictEqual(ok(rt.call('listar', { tabla: 'Clientes' }, B3.token)).length, 0);
// el contenido de sesiones/contraseñas nunca viaja
const lu = JSON.stringify(ok(rt.call('listar', { tabla: 'Usuarios' }, A.token)));
assert(!/Password_Hash|Salt|\$2a\$/.test(lu));
assert(!/\$2a\$/.test(JSON.stringify(ok(rt.call('me', {}, A.token)))));
// con el rol "anon" (la clave pública de Supabase) no se puede tocar ninguna tabla; solo api()
rt.exec('set role anon');
for (const t of ['"Productos"', 'negocios', 'sesiones', '"Usuarios"', 'intentos_login', 'subidas']) {
  assert.throws(() => rt.sql(`select * from ${t}`), /permission denied/i, 'anon no debe leer ' + t);
}
assert.throws(() => rt.sql('select sig_num($1::uuid, $2)', ['00000000-0000-0000-0000-000000000000', 'x']), /permission denied/i);
assert.throws(() => rt.sql("select a_listar(null, '{}')"), /permission denied|does not exist/i);
assert.strictEqual(rt.sql("select api('publico', '{}'::jsonb, null) as r")[0].r.ok, true);
rt.exec('reset role');

// --- Subida de archivos: solo con un permiso reservado, de un solo uso ---
const up = ok(rt.call('subirArchivo', { modulo: 'Inventario', nombre: 'foto.png', mime: 'image/png', tamano: 2000 }, A.token));
assert(up.path.startsWith(rt.sql("select id::text i from negocios where codigo = 'burger818'")[0].i + '/'));
assert.strictEqual(rt.sql('select puede_subir($1) ok', [up.path])[0].ok, true);
assert.strictEqual(rt.sql('select puede_subir($1) ok', [up.path])[0].ok, false, 'un permiso sirve una sola vez');
assert.strictEqual(rt.sql("select puede_subir('inventado/x.png') ok")[0].ok, false);
bad(rt.call('subirArchivo', { modulo: 'Inventario', nombre: 'x.png', mime: 'image/png', tamano: 7 * 1024 * 1024 }, A.token), 'demasiado grande');
bad(rt.call('subirArchivo', { modulo: 'Inventario', nombre: 'x.exe', mime: 'application/x-msdownload', tamano: 10 }, A.token), 'no permitido');

// --- Freno de registros por IP ---
rt.exec(`select set_config('request.headers', '{"x-forwarded-for":"9.9.9.9"}', false)`);
for (let i = 0; i < 5; i++) ok(reg('Spam ' + i, `spam${i}@x.cl`));
bad(reg('Spam 6', 'spam6@x.cl'), 'Demasiados registros');
rt.exec(`select set_config('request.headers', '{}', false)`);

console.log('✔ Supabase: todas las pruebas pasaron');
process.exit(0);
