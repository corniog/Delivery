// Prueba del generador ESC/POS: interpreta los bytes como lo haría una impresora y revisa ancho, tildes, avance y corte.
import assert from 'assert';
import { comprobante, comanda, prueba, abrirCaja } from '../web/src/escpos.js';

const ctx = {
  config: { DOCUMENTO_NEGOCIO: '76.000.000-0', DIRECCION_NEGOCIO: 'Calle Ejemplo 100, Ñuñoa' },
  brand: { NOMBRE_NEGOCIO: 'Burger 818' },
  money: (n) => '$' + Number(n).toLocaleString('es-CL'),
  fecha: (s) => String(s)
};
const venta = { ID_Venta: 'V000123', Fecha_Hora: '19-10-2026 20:15', Tipo_Entrega: 'Para servir', Referencia: 'Mesa 4', Nota_Cocina: 'Sin cebolla, bien cocida', Subtotal: 12500, Descuento: 500, Costo_Delivery: 0, Total: 12000, Metodo_Pago: 'Tarjeta', Estado_Pago: 'Pagado', Tipo_Documento: 'Boleta' };
const detalle = [
  { ID_Detalle: 1, Nombre_Producto: 'Hamburguesa doble con queso y tocino ahumado', Cantidad: 2, Precio_Unitario: 5000, Subtotal: 10000, Va_A_Cocina: true, Nota: 'sin pepinillos' },
  { ID_Detalle: 2, Nombre_Producto: 'Jugo de piña natural', Cantidad: 1, Precio_Unitario: 2500, Subtotal: 2500, Va_A_Cocina: false }
];
const data = { venta, detalle, documento: { Tipo: 'Boleta', Folio: '57', Neto: 10084, Impuesto: 1916 }, cliente: { Nombre: 'María Pérez', Documento: '12.345.678-9', Direccion: 'Av. Los Aromos 1234, Depto 5, Ñuñoa', Telefono: '+56 9 1234 5678' } };

// Mini impresora: devuelve líneas de texto, cortes y avances
function interpretar(bytes) {
  const out = { cajas: [], lineas: [], cortes: 0, avance: 0, finalEsCorte: false, ultimoAvance: 0 };
  let linea = [], w = 1, anchoMax = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x1b) {
      const n = bytes[i + 1];
      if (n === 0x40) i += 1; else if ([0x74, 0x61, 0x45].includes(n)) i += 2;
      else if (n === 0x4a) { out.avance += bytes[i + 2]; out.ultimoAvance = out.lineas.length; i += 2; out.finalEsCorte = false; }
      else if (n === 0x70) { out.cajas.push({ pin: bytes[i + 2], pos: out.lineas.length }); i += 4; }
      else throw new Error('ESC desconocido ' + n.toString(16));
    } else if (c === 0x1d) {
      const n = bytes[i + 1];
      if (n === 0x21) { w = ((bytes[i + 2] >> 4) & 7) + 1; i += 2; }
      else if (n === 0x56) { out.cortes++; out.finalEsCorte = true; i += 3; }
      else throw new Error('GS desconocido ' + n.toString(16));
    } else if (c === 0x0a) { out.lineas.push({ t: Buffer.from(linea).toString('latin1'), w, raw: linea }); linea = []; }
    else linea.push(c);
  }
  return out;
}
const cols = { 80: 42, 58: 32 };

for (const papel of ['80', '58']) {
  for (const tildes of [true, false]) {
    const pr = { papel, tildes, corte: papel === '80' };
    const ticket = interpretar(comprobante(data, ctx, pr));
    for (const l of ticket.lineas) assert(l.t.length * l.w <= cols[papel], `línea ancha (${papel}): "${l.t}"`);
    const txt = ticket.lineas.map((l) => l.t).join('\n');
    assert(txt.includes('BOLETA N') && txt.includes('57'), 'folio');
    assert(txt.includes('TOTAL'), 'total');
    if (!tildes) assert(ticket.lineas.every((l) => l.raw.every((b) => b < 0x80)), 'sin tildes = solo ASCII');
    else assert(ticket.lineas.some((l) => l.raw.includes(0xa4) || l.raw.includes(0xa5)), 'ñ en CP858');
    if (pr.corte) { assert.strictEqual(ticket.cortes, 1); assert(ticket.finalEsCorte, 'termina con corte'); }
    else { assert.strictEqual(ticket.cortes, 0); assert(ticket.avance >= 18 * 8, 'sin cortador avanza el papel: ' + ticket.avance); }

    const cm = interpretar(comanda(data, ctx, pr));
    for (const l of cm.lineas) assert(l.t.length * l.w <= cols[papel], `línea ancha comanda: "${l.t}"`);
    const t2 = cm.lineas.map((l) => l.t).join('\n');
    assert(t2.includes('COMANDA') && t2.includes('Mesa 4') && t2.includes('2 x Hamburguesa'), 'comanda');
    assert(!t2.includes('Jugo'), 'lo que no va a cocina no sale');
    assert(!t2.includes('$'), 'la comanda no lleva precios');
    assert(t2.includes('sin pepinillos') && t2.includes('Sin cebolla'), 'notas');
  }
}
// datos del cliente en el ticket
{
  const t = interpretar(comprobante(data, ctx, { papel: '58', tildes: true })).lineas.map((l) => l.t).join('\n');
  assert(t.includes('Cliente') && t.includes('Direccion: Av. Los Aromos') && t.includes('Telefono') && t.includes('5678'), 'cliente con direccion y telefono');
  const d = interpretar(comprobante({ ...data, servicio: { Direccion_Entrega: 'Otra 99' } }, ctx, { papel: '80' })).lineas.map((l) => l.t).join('\n');
  assert(d.includes('Direccion: Otra 99'), 'delivery usa la direccion de entrega');
  const sin = interpretar(comprobante({ ...data, cliente: { Nombre: 'Sin datos' } }, ctx, { papel: '80' })).lineas.map((l) => l.t).join('\n');
  assert(!sin.includes('Direccion') && !sin.includes('Telefono'), 'sin datos no se imprimen lineas vacias');
}
// caja de dinero
{
  const pr = { papel: '80', corte: true, caja: true };
  const a = interpretar(comprobante(data, ctx, pr));
  assert.strictEqual(a.cajas.length, 1, 'abre la caja al cobrar'); assert.strictEqual(a.cajas[0].pos, 0, 'abre antes de imprimir');
  assert.strictEqual(interpretar(comprobante(data, ctx, { ...pr, caja: false })).cajas.length, 0, 'sin caja configurada no abre');
  assert.strictEqual(interpretar(comprobante({ ...data, venta: { ...venta, Estado_Pago: 'Pendiente' }, documento: null }, ctx, pr)).cajas.length, 0, 'pago pendiente no abre');
  assert.strictEqual(interpretar(comprobante(data, ctx, { ...pr, cajaSoloEfectivo: true })).cajas.length, 0, 'solo efectivo: tarjeta no abre');
  assert.strictEqual(interpretar(comprobante({ ...data, venta: { ...venta, Metodo_Pago: 'Efectivo' } }, ctx, { ...pr, cajaSoloEfectivo: true })).cajas.length, 1, 'solo efectivo: efectivo abre');
  assert.strictEqual(interpretar(comprobante(data, ctx, { ...pr, pinCaja: 1 })).cajas[0].pin, 1, 'pin alternativo');
  assert.strictEqual(interpretar(abrirCaja({ papel: '80' })).cajas.length, 1, 'boton de prueba');
}
// pendiente: sin folio
const pend = interpretar(comprobante({ ...data, venta: { ...venta, Estado_Pago: 'Pendiente' }, documento: null }, ctx, { papel: '80', corte: true }));
const tp = pend.lineas.map((l) => l.t).join('\n');
assert(tp.includes('PAGO PENDIENTE') && !tp.includes('BOLETA N'), 'pedido pendiente sin boleta');
assert(prueba({ papel: '58' }).length > 20);
console.log('✔ ESC/POS: todas las pruebas pasaron');
