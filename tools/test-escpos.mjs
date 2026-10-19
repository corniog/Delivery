// Prueba del generador ESC/POS: interpreta los bytes como lo haría una impresora y revisa ancho, tildes, avance y corte.
import assert from 'assert';
import { comprobante, comanda, prueba } from '../web/src/escpos.js';

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
const data = { venta, detalle, documento: { Tipo: 'Boleta', Folio: '57', Neto: 10084, Impuesto: 1916 }, cliente: { Nombre: 'María Pérez', Documento: '12.345.678-9' } };

// Mini impresora: devuelve líneas de texto, cortes y avances
function interpretar(bytes) {
  const out = { lineas: [], cortes: 0, avance: 0, finalEsCorte: false, ultimoAvance: 0 };
  let linea = [], w = 1, anchoMax = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x1b) {
      const n = bytes[i + 1];
      if (n === 0x40) i += 1; else if ([0x74, 0x61, 0x45].includes(n)) i += 2;
      else if (n === 0x4a) { out.avance += bytes[i + 2]; out.ultimoAvance = out.lineas.length; i += 2; out.finalEsCorte = false; }
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
// pendiente: sin folio
const pend = interpretar(comprobante({ ...data, venta: { ...venta, Estado_Pago: 'Pendiente' }, documento: null }, ctx, { papel: '80', corte: true }));
const tp = pend.lineas.map((l) => l.t).join('\n');
assert(tp.includes('PAGO PENDIENTE') && !tp.includes('BOLETA N'), 'pedido pendiente sin boleta');
assert(prueba({ papel: '58' }).length > 20);
console.log('✔ ESC/POS: todas las pruebas pasaron');
