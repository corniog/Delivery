const { createRuntime } = process.env.BACKEND === 'pg' ? require('./pg-runtime') : require('./gas-mock');
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
// el repartidor NUNCA crea/edita/borra, ni siquiera con permisos marcados: solo gestiona sus pedidos
bad(rt.call('crear', { tabla: 'Deliverys', datos: { Nombre: 'Falso' } }, J), 'permiso');
bad(rt.call('actualizar', { tabla: 'Deliverys', id: del.ID_Delivery, datos: { Nombre: 'Cambiado' } }, J), 'permiso');
bad(rt.call('crearVenta', { tipoEntrega: 'Retiro en local', items: [] }, J), 'permiso');
bad(rt.call('mapaVivo', {}, J), 'permiso');
ok(rt.call('servicioEstado', { ID_Servicio: ms[0].ID_Servicio, estado: 'Aceptado' }, J));
ok(rt.call('servicioEstado', { ID_Servicio: ms[0].ID_Servicio, estado: 'Finalizado', Distancia_Km: 5, Tiempo_Min: 20 }, J));
assert(ok(rt.call('listar', { tabla: 'Alertas' }, V)).some(a => a.Tipo === 'Delivery finalizado'));
assert.strictEqual(ok(rt.call('listarVentas', {}, T)).rows[0].Estado, 'Entregada');
const h = ok(rt.call('historialDelivery', { nombre: 'juan' }, T));
assert.strictEqual(h.total, 1000); assert.strictEqual(h.servicios, 1); assert.strictEqual(h.km, 5);
assert.strictEqual(ok(rt.call('historialDelivery', { desde: '2099-01-01' }, T)).total, 0);

// venta pendiente: se registra y descuenta stock, pero NO emite documento hasta cobrar
const stock0 = Number(ok(rt.call('listar', { tabla: 'Productos' }, T)).find(p => p.ID_Producto === p2.ID_Producto).Stock_Actual);
const pend = ok(rt.call('crearVenta', { items: [{ ID_Producto: p2.ID_Producto, Cantidad: 2 }], metodoPago: 'Efectivo', estadoPago: 'Pendiente', tipoDocumento: 'Boleta' }, T));
assert.strictEqual(pend.venta.Estado_Pago, 'Pendiente'); assert.strictEqual(pend.documento, null);
assert.strictEqual(Number(ok(rt.call('listar', { tabla: 'Productos' }, T)).find(p => p.ID_Producto === p2.ID_Producto).Stock_Actual), stock0 - 2);
assert.strictEqual(ok(rt.call('detalleVenta', { ID_Venta: pend.venta.ID_Venta }, T)).documento, null);
bad(rt.call('pagarVenta', { ID_Venta: pend.venta.ID_Venta }, J), 'permiso');
bad(rt.call('pagarVenta', { ID_Venta: 'V999999' }, T), 'no encontrada');
const pag = ok(rt.call('pagarVenta', { ID_Venta: pend.venta.ID_Venta, metodoPago: 'Tarjeta', tipoDocumento: 'Factura' }, T));
assert.strictEqual(pag.venta.Estado_Pago, 'Pagado'); assert.strictEqual(pag.venta.Metodo_Pago, 'Tarjeta');
assert.strictEqual(pag.documento.Tipo, 'Factura'); assert.strictEqual(pag.documento.Folio, '1'); assert.strictEqual(Number(pag.documento.Total), 1600);
assert.strictEqual(pag.detalle.length, 1);
bad(rt.call('pagarVenta', { ID_Venta: pend.venta.ID_Venta }, T), 'ya está pagada');
assert.strictEqual(ok(rt.call('listarVentas', {}, T)).rows.find(v => v.ID_Venta === pend.venta.ID_Venta).Estado_Pago, 'Pagado');
// una venta pendiente anulada no se puede cobrar
const pend2 = ok(rt.call('crearVenta', { items: [{ ID_Producto: p2.ID_Producto, Cantidad: 1 }], estadoPago: 'Parcial' }, T));
ok(rt.call('anularVenta', { ID_Venta: pend2.venta.ID_Venta }, T));
bad(rt.call('pagarVenta', { ID_Venta: pend2.venta.ID_Venta }, T), 'anulada');
ok(rt.call('anularVenta', { ID_Venta: pend.venta.ID_Venta }, T));

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
  // comanda: referencia, nota general y nota por producto; producto que no va a cocina
  const bebida = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Bebida', Precio_Venta: 1000, Stock_Actual: 10, Stock_Minimo: 1, Va_A_Cocina: false } }, M2));
  const burger = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Burger', Precio_Venta: 5000, Stock_Actual: 10, Stock_Minimo: 1 } }, M2));
  const vc = ok(rt.call('crearVenta', { tipoEntrega: 'Para servir', referencia: 'Mesa 4', notaCocina: 'Salir juntos',
    items: [{ ID_Producto: burger.ID_Producto, Cantidad: 2, Nota: 'sin cebolla' }, { ID_Producto: burger.ID_Producto, Cantidad: 1, Nota: 'bien cocida' }, { ID_Producto: bebida.ID_Producto, Cantidad: 2 }] }, M2));
  assert.strictEqual(vc.venta.Referencia, 'Mesa 4'); assert.strictEqual(vc.venta.Nota_Cocina, 'Salir juntos');
  const lb = vc.detalle.find(x => x.ID_Producto === burger.ID_Producto), ld = vc.detalle.find(x => x.ID_Producto === bebida.ID_Producto);
  assert.strictEqual(lb.Cantidad, 3); assert.strictEqual(lb.Nota, 'sin cebolla / bien cocida'); assert.strictEqual(lb.Va_A_Cocina, true);
  assert.strictEqual(ld.Va_A_Cocina, false);
  const dd = ok(rt.call('detalleVenta', { ID_Venta: vc.venta.ID_Venta }, M2));
  assert.strictEqual(dd.venta.Referencia, 'Mesa 4'); assert(dd.detalle.some(x => x.Nota === 'sin cebolla / bien cocida'));
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
  bad(rt.call('mapaVivo', {}, Jt), 'permiso');
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

// productos preparados (recetas): se descuentan los ingredientes, no el producto
{
  const pan = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Pan hamburguesa', Precio_Venta: 600, Precio_Compra: 300, Stock_Actual: 10, Stock_Minimo: 2, Unidad_Medida: 'Unidad' } }, T));
  const carne = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Carne molida', Precio_Venta: 9000, Precio_Compra: 6000, Stock_Actual: 2, Stock_Minimo: 0.5, Unidad_Medida: 'Kilogramo' } }, T));
  const queso = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Queso laminado', Precio_Venta: 12000, Precio_Compra: 8000, Stock_Actual: 1, Stock_Minimo: 0.1, Unidad_Medida: 'Kilogramo' } }, T));
  const stockDe = (id) => Number(ok(rt.call('listar', { tabla: 'Productos' }, T)).find(x => x.ID_Producto === id).Stock_Actual);
  const movsAntes = rt.readAll('Movimientos_Inventario').length;
  const burger = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Hamburguesa doble', ID_Categoria: cat.ID_Categoria, Precio_Venta: 5000, Es_Preparado: true, Stock_Actual: 99, Stock_Minimo: 5 } }, T));
  assert.strictEqual(stockDe(burger.ID_Producto), 0, 'El preparado no lleva stock propio');
  assert.strictEqual(rt.readAll('Movimientos_Inventario').length, movsAntes, 'Sin movimiento de stock inicial para preparados');
  const ing = (p, cant, cantR, uni) => ({ ID_Ingrediente: p.ID_Producto, Cantidad: cant, Cantidad_Receta: cantR, Unidad_Receta: uni });
  // validaciones de la receta
  bad(rt.call('guardarReceta', { ID_Producto: p2.ID_Producto, ingredientes: [ing(pan, 1, 1, 'un')] }, T), 'preparado');
  bad(rt.call('guardarReceta', { ID_Producto: burger.ID_Producto, ingredientes: [] }, T), 'al menos un ingrediente');
  bad(rt.call('guardarReceta', { ID_Producto: burger.ID_Producto, ingredientes: [ing(burger, 1, 1, 'un')] }, T), 'sí mismo');
  bad(rt.call('guardarReceta', { ID_Producto: burger.ID_Producto, ingredientes: [ing(pan, 0, 0, 'un')] }, T), 'Cantidad inválida');
  bad(rt.call('guardarReceta', { ID_Producto: burger.ID_Producto, ingredientes: [ing(pan, 1, 1, 'un'), ing(pan, 1, 1, 'un')] }, T), 'repetido');
  bad(rt.call('crearVenta', { items: [{ ID_Producto: burger.ID_Producto, Cantidad: 1 }] }, T), 'no tiene ingredientes');
  const g = ok(rt.call('guardarReceta', { ID_Producto: burger.ID_Producto, ingredientes: [ing(pan, 1, 1, 'un'), ing(carne, 0.2, 200, 'g'), ing(queso, 0.02, 20, 'g')] }, T));
  assert.strictEqual(g.Costo, 300 + 1200 + 160);
  assert.strictEqual(Number(ok(rt.call('listar', { tabla: 'Productos' }, T)).find(x => x.ID_Producto === burger.ID_Producto).Precio_Compra), 1660);
  assert.strictEqual(ok(rt.call('listar', { tabla: 'Receta_Ingredientes' }, T)).length, 3);
  // otro preparado no puede usarse como ingrediente
  const otro = ok(rt.call('crear', { tabla: 'Productos', datos: { Nombre: 'Combo', Precio_Venta: 7000, Es_Preparado: true } }, T));
  bad(rt.call('guardarReceta', { ID_Producto: otro.ID_Producto, ingredientes: [ing(burger, 1, 1, 'un')] }, T), 'preparado');
  // guardar de nuevo reemplaza (no duplica)
  ok(rt.call('guardarReceta', { ID_Producto: burger.ID_Producto, ingredientes: [ing(pan, 1, 1, 'un'), ing(carne, 0.2, 200, 'g'), ing(queso, 0.02, 20, 'g')] }, T));
  assert.strictEqual(ok(rt.call('listar', { tabla: 'Receta_Ingredientes' }, T)).length, 3);
  // el vendedor (R02) puede vender preparados pero no ve ni cambia recetas sin permiso de edición de otros
  // venta de 2 hamburguesas + 1 pan suelto
  const vr = ok(rt.call('crearVenta', { items: [{ ID_Producto: burger.ID_Producto, Cantidad: 2 }, { ID_Producto: pan.ID_Producto, Cantidad: 1 }] }, V));
  assert.strictEqual(vr.detalle.find(x => x.ID_Producto === burger.ID_Producto).Costo_Unitario, 1660);
  assert.strictEqual(vr.venta.Total, 10600);
  assert.strictEqual(stockDe(pan.ID_Producto), 7);
  assert.strictEqual(stockDe(carne.ID_Producto), 1.6);
  assert.strictEqual(stockDe(queso.ID_Producto), 0.96);
  assert.strictEqual(stockDe(burger.ID_Producto), 0);
  const movsVenta = rt.readAll('Movimientos_Inventario').filter(x => x.Referencia === vr.venta.ID_Venta && x.Tipo === 'Salida venta');
  assert.strictEqual(movsVenta.length, 3, 'un movimiento por ingrediente');
  assert(!movsVenta.some(x => x.ID_Producto === burger.ID_Producto), 'el preparado no tiene movimientos');
  // stock insuficiente de un ingrediente: no se vende ni se descuenta nada
  bad(rt.call('crearVenta', { items: [{ ID_Producto: burger.ID_Producto, Cantidad: 9 }] }, T), 'Falta');
  assert.strictEqual(stockDe(pan.ID_Producto), 7);
  assert.strictEqual(stockDe(carne.ID_Producto), 1.6);
  // anular devuelve los ingredientes
  ok(rt.call('anularVenta', { ID_Venta: vr.venta.ID_Venta }, T));
  assert.strictEqual(stockDe(pan.ID_Producto), 10);
  assert.strictEqual(stockDe(carne.ID_Producto), 2);
  assert.strictEqual(stockDe(queso.ID_Producto), 1);
  assert.strictEqual(stockDe(burger.ID_Producto), 0);
  // reglas de integridad
  bad(rt.call('ajustarStock', { ID_Producto: burger.ID_Producto, tipo: 'Entrada compra', cantidad: 5 }, T), 'preparado');
  const prov = ok(rt.call('crear', { tabla: 'Proveedores', datos: { Nombre: 'Distribuidora' } }, T));
  bad(rt.call('crearCompra', { ID_Proveedor: prov.ID_Proveedor, items: [{ ID_Producto: burger.ID_Producto, Cantidad: 1, Costo_Unitario: 100 }] }, T), 'preparado');
  bad(rt.call('eliminar', { tabla: 'Productos', id: carne.ID_Producto }, T), 'ingrediente de');
  bad(rt.call('actualizar', { tabla: 'Productos', id: carne.ID_Producto, datos: { Es_Preparado: true } }, T), 'ingrediente de');
  assert(!ok(rt.call('kpi', {}, T)).bajoStock.some(x => x.nombre === 'Hamburguesa doble'), 'Un preparado no cuenta como stock bajo');
  // quitar la marca de preparado borra su receta; borrar el preparado también
  ok(rt.call('actualizar', { tabla: 'Productos', id: burger.ID_Producto, datos: { Es_Preparado: false } }, T));
  assert.strictEqual(ok(rt.call('listar', { tabla: 'Receta_Ingredientes' }, T)).length, 0);
  ok(rt.call('actualizar', { tabla: 'Productos', id: burger.ID_Producto, datos: { Es_Preparado: true } }, T));
  ok(rt.call('guardarReceta', { ID_Producto: burger.ID_Producto, ingredientes: [ing(pan, 1, 1, 'un')] }, T));
  ok(rt.call('eliminar', { tabla: 'Productos', id: burger.ID_Producto }, T));
  assert.strictEqual(ok(rt.call('listar', { tabla: 'Receta_Ingredientes' }, T)).length, 0);
  ok(rt.call('eliminar', { tabla: 'Productos', id: carne.ID_Producto }, T));
  // el repartidor no puede tocar recetas
  bad(rt.call('guardarReceta', { ID_Producto: otro.ID_Producto, ingredientes: [] }, J), 'permiso');
}

// bloqueo por intentos
for (let i = 0; i < 5; i++) rt.call('login', { email: 'juan@test.com', password: 'x' });
bad(rt.call('login', { email: 'juan@test.com', password: 'Juan123456' }), 'Demasiados intentos');
console.log('✔ Backend: todas las pruebas pasaron');
