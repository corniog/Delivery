const { createRuntime } = require('./gas-mock');
const assert = require('assert');
const rt = createRuntime({ admin: { email: 'master@test.com', password: 'Clave12345' } });
rt.install();
const ok = (r) => { if (!r.ok) throw new Error('Esperaba ok: ' + r.error); return r.data; };
const bad = (r, txt) => { assert.strictEqual(r.ok, false, 'Esperaba error'); if (txt) assert(r.error.includes(txt), `Error "${r.error}" no contiene "${txt}"`); };

// publico + login
assert.strictEqual(ok(rt.call('publico')).NOMBRE_NEGOCIO, 'Mi Negocio');
bad(rt.call('login', { email: 'master@test.com', password: 'mala' }), 'incorrectos');
const m = ok(rt.call('login', { email: 'master@test.com', password: 'Clave12345' }));
const T = m.token;
assert(m.perms.Inventario.Eliminar === true);
bad(rt.call('listar', { tabla: 'Productos' }), 'Sesión');

// categoria + productos
const cat = ok(rt.call('crear', { tabla: 'Categorias', datos: { Nombre: 'Bebidas', Activo: true } }, T));
const p1 = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Cola', ID_Categoria: cat.ID_Categoria, Precio_Venta: 1500, Precio_Compra: 900, Stock_Actual: 12, Stock_Minimo: 10, Codigo_Barras: '0012345', Unidad_Medida: 'Unidad' } }, T));
const p2 = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Agua', ID_Categoria: cat.ID_Categoria, Precio_Venta: 800, Precio_Compra: 400, Stock_Actual: 50, Stock_Minimo: 5 } }, T));
bad(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Dup', Codigo_Barras: '0012345' } }, T), 'código de barras');
assert.strictEqual(String(ok(rt.call('listar', { tabla: 'Productos' }, T))[0].Codigo_Barras), '0012345');

// usuarios: ventas (R02) y delivery (R03)
const del = ok(rt.call('crear', { tabla: 'Deliverys', datos: { Nombre: 'Juan Pérez', Activo: true } }, T));
ok(rt.call('usuariosCrear', { Email: 'ventas@test.com', Nombre: 'Vendedor', ID_Rol: 'R02', password: 'Ventas1234' }, T));
ok(rt.call('usuariosCrear', { Email: 'juan@test.com', Nombre: 'Juan', ID_Rol: 'R03', ID_Delivery: del.ID_Delivery, password: 'Juan123456' }, T));
bad(rt.call('usuariosCrear', { Email: 'x@test.com', Nombre: 'X', ID_Rol: 'R02', password: 'corta' }, T), '8 caracteres');
const V = ok(rt.call('login', { email: 'ventas@test.com', password: 'Ventas1234' })).token;
const J = ok(rt.call('login', { email: 'juan@test.com', password: 'Juan123456' })).token;
const listU = ok(rt.call('listar', { tabla: 'Usuarios' }, T));
assert(!('Password_Hash' in listU[0]) && !('Salt' in listU[0]), 'No debe filtrar hashes');

// permisos del vendedor: puede crear producto, NO eliminar
const p3 = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Jugo', Precio_Venta: 1000, Stock_Actual: 5, Stock_Minimo: 1 } }, V));
bad(rt.call('eliminar', { tabla: 'Productos', id: p3.ID_Producto }, V), 'permiso');
bad(rt.call('listar', { tabla: 'Usuarios' }, V), 'permiso');
bad(rt.call('kpi', {}, V), 'permiso');
// Master habilita eliminar al vendedor por excepción de usuario
const vend = listU.find(u => u.Email === 'ventas@test.com');
const matriz = ['Inventario'].map(Modulo => ({ Modulo, Ver: true, Crear: true, Editar: true, Eliminar: true, Exportar: false }));
ok(rt.call('permisosGuardar', { ID_Usuario: vend.ID_Usuario, matriz }, T));
ok(rt.call('eliminar', { tabla: 'Productos', id: p3.ID_Producto }, V));
bad(rt.call('permisosGuardar', { ID_Rol: 'R02', matriz }, V), 'Master');

// venta con descuento de stock + alerta de mínimo + delivery
const cli = ok(rt.call('crear', { tabla: 'Clientes', datos: { Nombre: 'María', Direccion: 'Av. 123', Telefono: '+56911' } }, V));
bad(rt.call('crearVenta', { items: [{ ID_Producto: p1.ID_Producto, Cantidad: 99 }], tipoEntrega: 'Retiro en local' }, V), 'Stock insuficiente');
const r = ok(rt.call('crearVenta', {
  ID_Cliente: cli.ID_Cliente, tipoEntrega: 'Delivery', metodoPago: 'Efectivo', tipoDocumento: 'Boleta',
  items: [{ ID_Producto: p1.ID_Producto, Cantidad: 3 }, { ID_Producto: p2.ID_Producto, Cantidad: 2 }, { ID_Producto: p2.ID_Producto, Cantidad: 1 }],
  delivery: { ID_Delivery: del.ID_Delivery, Monto_Delivery: 1000, Distancia_Km: 4.2 }
}, V));
assert.strictEqual(r.venta.Subtotal, 3 * 1500 + 3 * 800);
assert.strictEqual(r.venta.Total, 6900 + 1000);
assert.strictEqual(r.detalle.length, 2);
const prods = ok(rt.call('listar', { tabla: 'Productos' }, T));
assert.strictEqual(Number(prods.find(p => p.ID_Producto === p1.ID_Producto).Stock_Actual), 9);
assert.strictEqual(Number(prods.find(p => p.ID_Producto === p2.ID_Producto).Stock_Actual), 47);
const alertas = ok(rt.call('listar', { tabla: 'Alertas' }, V));
assert(alertas.some(a => a.Tipo === 'Stock minimo' && a.Mensaje.includes('Cola')), 'Debe alertar stock mínimo');
assert.strictEqual(rt.readAll('Movimientos_Inventario').filter(x => x.Tipo === 'Salida venta').length, 2);
assert.strictEqual(r.documento.Folio, '1');

// delivery: solo ve lo suyo, acepta y finaliza -> alerta a master/ventas
const ms = ok(rt.call('misServicios', {}, J));
assert.strictEqual(ms.length, 1); assert.strictEqual(ms[0].items.length, 2); assert.strictEqual(ms[0].Cliente, 'María');
bad(rt.call('listar', { tabla: 'Clientes' }, J), 'permiso');
bad(rt.call('listarVentas', {}, J), 'permiso');
ok(rt.call('servicioEstado', { ID_Servicio: ms[0].ID_Servicio, estado: 'Aceptado' }, J));
ok(rt.call('servicioEstado', { ID_Servicio: ms[0].ID_Servicio, estado: 'Finalizado', Distancia_Km: 5, Tiempo_Min: 20 }, J));
assert(ok(rt.call('listar', { tabla: 'Alertas' }, V)).some(a => a.Tipo === 'Delivery finalizado'));
assert.strictEqual(ok(rt.call('listarVentas', {}, T)).rows[0].Estado, 'Entregada');
const h = ok(rt.call('historialDelivery', { nombre: 'juan' }, T));
assert.strictEqual(h.total, 1000); assert.strictEqual(h.servicios, 1); assert.strictEqual(h.km, 5);
assert.strictEqual(ok(rt.call('historialDelivery', { desde: '2099-01-01' }, T)).total, 0);

// anular venta restaura stock
bad(rt.call('anularVenta', { ID_Venta: r.venta.ID_Venta }, J), 'permiso');
ok(rt.call('anularVenta', { ID_Venta: r.venta.ID_Venta, motivo: 'prueba' }, T));
assert.strictEqual(Number(ok(rt.call('listar', { tabla: 'Productos' }, T)).find(p => p.ID_Producto === p1.ID_Producto).Stock_Actual), 12);
bad(rt.call('anularVenta', { ID_Venta: r.venta.ID_Venta }, T), 'ya está anulada');

// stock / KPI / logo / config
ok(rt.call('ajustarStock', { ID_Producto: p1.ID_Producto, tipo: 'Merma', cantidad: 2, nota: 'roto' }, T));
bad(rt.call('ajustarStock', { ID_Producto: p1.ID_Producto, tipo: 'Merma', cantidad: 999 }, T), 'supera');
const r2 = ok(rt.call('crearVenta', { tipoEntrega: 'Retiro en local', items: [{ ID_Producto: p2.ID_Producto, Cantidad: 4 }] }, V));
const k = ok(rt.call('kpi', {}, T));
assert.strictEqual(k.ventas, 1); assert.strictEqual(k.topProductos[0].nombre, 'Agua'); assert.strictEqual(k.total, 3200);
const up = ok(rt.call('subirArchivo', { modulo: 'Configuracion', nombre: 'logo.png', mime: 'image/png', base64: Buffer.from('x').toString('base64') }, T));
bad(rt.call('subirArchivo', { modulo: 'Configuracion', nombre: 'logo.png', mime: 'image/png', base64: 'eA==' }, V), 'permiso');
bad(rt.call('subirArchivo', { modulo: 'Configuracion', nombre: 'a.exe', mime: 'application/x-msdownload', base64: 'eA==' }, T), 'no permitido');
ok(rt.call('guardarConfig', { valores: { LOGO: up.url, NOMBRE_NEGOCIO: 'Panadería Sol' } }, T));
const pub = ok(rt.call('publico'));
assert.strictEqual(pub.LOGO, up.url); assert.strictEqual(pub.NOMBRE_NEGOCIO, 'Panadería Sol');
assert.strictEqual(ok(rt.call('me', {}, J)).config.LOGO, up.url, 'El logo debe llegar a todos los perfiles');
bad(rt.call('guardarConfig', { valores: { LOGO: 'x' } }, V), 'permiso');
bad(rt.call('exportar', { hojas: ['Usuarios'] }, V), 'permiso');
assert.deepStrictEqual(Object.keys(ok(rt.call('exportar', { hojas: ['Usuarios', 'Productos'] }, T))), ['Productos']);
// cambio de contraseña
ok(rt.call('cambiarPassword', { actual: 'Ventas1234', nueva: 'NuevaClave99' }, V));
ok(rt.call('login', { email: 'ventas@test.com', password: 'NuevaClave99' }));
// ---- venta para servir ----
{
  const M2 = ok(rt.call('login', { email: 'master@test.com', password: 'Clave12345' })).token;
  const vs = ok(rt.call('crearVenta', { tipoEntrega: 'Para servir', items: [{ ID_Producto: p2.ID_Producto, Cantidad: 1 }] }, M2));
  assert.strictEqual(vs.venta.Tipo_Entrega, 'Para servir');
  assert.strictEqual(ok(rt.call('misServicios', {}, M2)).filter(x => x.ID_Venta === vs.venta.ID_Venta).length, 0, 'sin servicio de delivery');
}

// ---- compras a proveedores ----
{
  const M = ok(rt.call('login', { email: 'master@test.com', password: 'Clave12345' })).token;
  const prov = ok(rt.call('crear', { tabla: 'Proveedores', datos: { Nombre: 'Distribuidora Norte' } }, M));
  const stk = (id) => Number(ok(rt.call('listar', { tabla: 'Productos' }, M)).find(x => x.ID_Producto === id).Stock_Actual);
  const s0 = stk(p2.ID_Producto);
  bad(rt.call('crearCompra', { ID_Proveedor: prov.ID_Proveedor, items: [] }, M), 'al menos un producto');
  bad(rt.call('crearCompra', { ID_Proveedor: prov.ID_Proveedor, items: [{ ID_Producto: p2.ID_Producto, Cantidad: 0, Costo_Unitario: 10 }] }, M), 'Cantidad');
  bad(rt.call('crearCompra', { ID_Proveedor: 'NO', items: [{ ID_Producto: p2.ID_Producto, Cantidad: 1, Costo_Unitario: 1 }] }, M), 'proveedor');
  const c1 = ok(rt.call('crearCompra', { ID_Proveedor: prov.ID_Proveedor, nota: 'Fact 123', items: [{ ID_Producto: p2.ID_Producto, Cantidad: 10, Costo_Unitario: 450 }, { ID_Producto: p1.ID_Producto, Cantidad: 5, Costo_Unitario: 950 }] }, M));
  assert.strictEqual(c1.Total, 9250); assert.strictEqual(c1.Estado, 'Recibida');
  assert.strictEqual(stk(p2.ID_Producto), s0 + 10);
  assert.strictEqual(Number(ok(rt.call('listar', { tabla: 'Productos' }, M)).find(x => x.ID_Producto === p2.ID_Producto).Precio_Compra), 450, 'actualiza costo');
  // pendiente: no suma hasta recibir
  const c2 = ok(rt.call('crearCompra', { ID_Proveedor: prov.ID_Proveedor, recibir: false, items: [{ ID_Producto: p2.ID_Producto, Cantidad: 20, Costo_Unitario: 500 }] }, M));
  assert.strictEqual(c2.Estado, 'Pendiente'); assert.strictEqual(stk(p2.ID_Producto), s0 + 10);
  ok(rt.call('recibirCompra', { ID_Compra: c2.ID_Compra }, M));
  assert.strictEqual(stk(p2.ID_Producto), s0 + 30);
  bad(rt.call('recibirCompra', { ID_Compra: c2.ID_Compra }, M), 'pendientes');
  // anular recibida revierte stock; si ya se vendió no deja
  ok(rt.call('anularCompra', { ID_Compra: c2.ID_Compra, motivo: 'error' }, M));
  assert.strictEqual(stk(p2.ID_Producto), s0 + 10);
  bad(rt.call('anularCompra', { ID_Compra: c2.ID_Compra }, M), 'ya está anulada');
  // vender casi todo y luego intentar anular c1
  ok(rt.call('ajustarStock', { ID_Producto: p2.ID_Producto, tipo: 'Ajuste', nuevoStock: 3 }, M));
  bad(rt.call('anularCompra', { ID_Compra: c1.ID_Compra }, M), 'ya se vendió');
  const lc = ok(rt.call('listarCompras', {}, M));
  assert.strictEqual(lc.cantidad, 1); assert.strictEqual(lc.total, 9250);
  assert.strictEqual(lc.rows.length, 2); assert.strictEqual(lc.rows.find(r => r.ID_Compra === c1.ID_Compra).items.length, 2);
  assert.strictEqual(lc.rows[0].Proveedor, 'Distribuidora Norte');
  // sin permiso: ventas solo ve proveedores
  const Vt = ok(rt.call('login', { email: 'ventas@test.com', password: 'NuevaClave99' })).token;
  bad(rt.call('crearCompra', { ID_Proveedor: prov.ID_Proveedor, items: [{ ID_Producto: p2.ID_Producto, Cantidad: 1, Costo_Unitario: 1 }] }, Vt), 'permiso');
  bad(rt.call('crear', { tabla: 'Compras', datos: { Total: 1 } }, M), 'No se puede crear');
  ok(rt.call('listarCompras', {}, Vt));
}

// ---- mapa en vivo ----
{
  const M = ok(rt.call('login', { email: 'master@test.com', password: 'Clave12345' })).token;
  const Jt = ok(rt.call('login', { email: 'juan@test.com', password: 'Juan123456' })).token;
  bad(rt.call('ubicacion', { lat: -33.4, lng: -70.6 }, M), 'repartidores');
  bad(rt.call('ubicacion', { lat: 999, lng: 1 }, Jt), 'inválida');
  bad(rt.call('mapaVivo', {}, Jt), 'administración');
  const v = ok(rt.call('crearVenta', { tipoEntrega: 'Delivery', direccion: 'Calle 1', items: [{ ID_Producto: p1.ID_Producto, Cantidad: 1 }],
    delivery: { ID_Delivery: del.ID_Delivery, Monto_Delivery: 1000, Destino_LatLong: '-33.4500,-70.6600' } }, M));
  const sv = ok(rt.call('misServicios', { estados: ['Asignado'] }, Jt));
  ok(rt.call('servicioEstado', { ID_Servicio: sv[0].ID_Servicio, estado: 'Aceptado' }, Jt));
  ok(rt.call('ubicacion', { lat: -33.44, lng: -70.65 }, Jt));
  const mv = ok(rt.call('mapaVivo', {}, M));
  const r = mv.repartidores.find(x => x.ID_Delivery === del.ID_Delivery);
  assert.strictEqual(r.lat, -33.44); assert.strictEqual(r.lng, -70.65);
  assert.strictEqual(r.servicios.length, 1); assert.deepStrictEqual(r.servicios[0].dest, [-33.45, -70.66]);
  assert.strictEqual(r.ruta.length, 1, 'rastro con pedido en curso');
  ok(rt.call('ubicacion', { lat: -33.43, lng: -70.64 }, Jt));
  assert.strictEqual(ok(rt.call('mapaVivo', {}, M)).repartidores.find(x => x.ID_Delivery === del.ID_Delivery).ruta.length, 1, 'rastro limitado a 1/min');
  assert(mv.origen && mv.origen.length === 2);
}

// bloqueo por intentos
for (let i = 0; i < 5; i++) rt.call('login', { email: 'juan@test.com', password: 'x' });
bad(rt.call('login', { email: 'juan@test.com', password: 'Juan123456' }), 'Demasiados intentos');
console.log('✔ Backend: todas las pruebas pasaron');
