// Generador de tickets ESC/POS (el lenguaje de las impresoras térmicas Epson, Star en modo ESC/POS y las Bluetooth económicas).
// Es código puro (sin React) para poder probarlo en Node. Devuelve Uint8Array listo para enviar a la impresora.
const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

// Página de códigos PC858 (Europa occidental, con € y tildes): ESC t 19
const CP858 = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, '¿': 0xa8, '¡': 0xad, 'ü': 0x81, 'Ü': 0x9a,
  'ä': 0x84, 'ö': 0x94, 'Ä': 0x8e, 'Ö': 0x99, 'à': 0x85, 'â': 0x83, 'è': 0x8a, 'ê': 0x88, 'ç': 0x87, 'Ç': 0x80, 'Á': 0xb5,
  'À': 0xb7, 'Â': 0xb6, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, '€': 0xd5, '°': 0xf8, 'ô': 0x93, 'î': 0x8c, 'û': 0x96,
  'ë': 0x89, 'ï': 0x8b
};

export const limpiar = (s) => String(s ?? '')
  .replace(/ | /g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[·•]/g, '-').replace(/[\r\n\t]+/g, ' ');
const aAscii = (s) => s.replace(/¿/g, '?').replace(/¡/g, '!').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');

export const COLUMNAS = { '58': 32, '80': 42 };

export class Ticket {
  constructor({ cols = 42, tildes = true } = {}) {
    this.cols = cols; this.tildes = tildes; this.b = [];
    this.raw(ESC, 0x40);                       // inicializar
    if (tildes) this.raw(ESC, 0x74, 19);       // PC858
  }
  raw(...n) { for (const x of n) this.b.push(x & 0xff); return this; }
  enc(s) {
    s = limpiar(s);
    if (!this.tildes) { for (const c of aAscii(s)) this.b.push(c.charCodeAt(0)); return; }
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (c >= 0x20 && c < 0x7f) this.b.push(c);
      else if (CP858[ch] !== undefined) this.b.push(CP858[ch]);
      else for (const x of aAscii(ch)) this.b.push(x.charCodeAt(0));
    }
  }
  align(a) { return this.raw(ESC, 0x61, a === 'c' ? 1 : a === 'r' ? 2 : 0); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(w = 1, h = 1) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)); }
  // Divide el texto en líneas del ancho disponible (respeta palabras)
  envolver(s, ancho) {
    const out = []; let linea = '';
    for (const palabra of limpiar(s).split(' ')) {
      let p = palabra;
      while (p.length > ancho) { if (linea) { out.push(linea); linea = ''; } out.push(p.slice(0, ancho)); p = p.slice(ancho); }
      if (!linea) linea = p; else if ((linea + ' ' + p).length <= ancho) linea += ' ' + p; else { out.push(linea); linea = p; }
    }
    if (linea || !out.length) out.push(linea);
    return out;
  }
  // Texto con formato opcional: { a: 'l'|'c'|'r', b: negrita, w, h: tamaño 1-2 }
  p(s, { a = 'l', b = false, w = 1, h = 1 } = {}) {
    this.align(a); this.bold(b); this.size(w, h);
    for (const l of this.envolver(s, Math.floor(this.cols / w))) { this.enc(l); this.raw(LF); }
    return this.size(1, 1).bold(false).align('l');
  }
  lr(izq, der, { b = false, w = 1, h = 1 } = {}) {
    const ancho = Math.floor(this.cols / w);
    izq = limpiar(izq); der = limpiar(der);
    if (izq.length + der.length + 1 > ancho) izq = izq.slice(0, Math.max(1, ancho - der.length - 1));
    return this.p(izq + ' '.repeat(Math.max(1, ancho - izq.length - der.length)) + der, { b, w, h });
  }
  hr() { return this.p('-'.repeat(this.cols)); }
  nl(n = 1) { for (let i = 0; i < n; i++) this.raw(LF); return this; }
  // Avanza el papel (mm). 1 mm ≈ 8 puntos
  avanzar(mm) { let d = Math.round(Math.max(0, mm) * 8); while (d > 0) { const n = Math.min(255, d); this.raw(ESC, 0x4a, n); d -= n; } return this; }
  // Final del ticket: con cortador avanza hasta la cuchilla y corta; sin cortador deja salir el papel pasada la barra de rasgado
  fin({ corte = false, avance = corte ? 3 : 18 } = {}) {
    this.avanzar(avance);
    if (corte) this.raw(GS, 0x56, 66, 0);
    return this;
  }
  // Abre la caja de dinero conectada (RJ-11) a la impresora: pulso ESC p. pin 0 = el normal; pin 1 = algunas cajas
  caja(pin = 0) { return this.raw(ESC, 0x70, Number(pin) === 1 ? 1 : 0, 60, 120); }
  bytes() { return Uint8Array.from(this.b); }
}

export function base64(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const colsDe = (pr) => Number(pr.cols) || COLUMNAS[pr.papel] || 42;
const nuevo = (pr) => new Ticket({ cols: colsDe(pr), tildes: pr.tildes !== false });
const cierre = (t, pr) => t.fin({ corte: !!pr.corte, avance: pr.avance === undefined || pr.avance === '' ? undefined : Number(pr.avance) });

// Dirección a mostrar: la de entrega del delivery si existe; si no, la del cliente
export const direccionCliente = ({ cliente, servicio }) => String((servicio && servicio.Direccion_Entrega) || (cliente && cliente.Direccion) || '').trim();

// ¿Esta impresora debe abrir la caja con esta venta? Solo cuando el pago está confirmado.
export function debeAbrirCaja(venta, pr, pagado) {
  if (!pr || !pr.caja || !pagado) return false;
  if (pr.cajaSoloEfectivo) return ['Efectivo', 'Mixto'].includes(venta.Metodo_Pago);
  return true;
}

// Solo abrir la caja (botón de prueba)
export function abrirCaja(pr) { return nuevo(pr).caja(pr.pinCaja).bytes(); }

// ctx: { config, brand, money(n), fecha(s) }
export function comprobante(data, ctx, pr) {
  const { venta, detalle, documento, cliente } = data;
  const { config, brand, money, fecha } = ctx;
  const t = nuevo(pr);
  const tipo = (documento && documento.Tipo) || venta.Tipo_Documento || 'Ticket';
  const pendiente = !documento || venta.Estado_Pago !== 'Pagado';
  if (debeAbrirCaja(venta, pr, !pendiente)) t.caja(pr.pinCaja);   // la caja abre apenas se confirma el cobro
  const nombre = brand.NOMBRE_NEGOCIO || '';
  t.p(nombre, { a: 'c', b: true, w: nombre.length * 2 <= t.cols ? 2 : 1, h: 2 });
  if (config.DOCUMENTO_NEGOCIO) t.p(config.DOCUMENTO_NEGOCIO, { a: 'c' });
  if (config.DIRECCION_NEGOCIO) t.p(config.DIRECCION_NEGOCIO, { a: 'c' });
  t.hr();
  if (pendiente) t.p('PEDIDO - PAGO ' + String(venta.Estado_Pago || 'Pendiente').toUpperCase(), { a: 'c', b: true });
  else t.p(tipo.toUpperCase() + ' N° ' + documento.Folio, { b: true });
  t.lr('Venta', venta.ID_Venta).lr('Fecha', fecha(venta.Fecha_Hora));
  if (cliente) {
    t.lr('Cliente', cliente.Nombre);
    if (cliente.Documento) t.lr('Doc.', cliente.Documento);
    const dir = direccionCliente(data);
    if (dir) t.p('Direccion: ' + dir);
    if (cliente.Telefono) t.lr('Telefono', String(cliente.Telefono));
  }
  t.hr();
  for (const d of detalle) {
    t.p(d.Nombre_Producto);
    t.lr(`${Number(d.Cantidad)} x ${money(d.Precio_Unitario)}`, money(d.Subtotal));
  }
  t.hr();
  t.lr('Subtotal', money(venta.Subtotal));
  if (Number(venta.Descuento) > 0) t.lr('Descuento', '-' + money(venta.Descuento));
  if (Number(venta.Costo_Delivery) > 0) t.lr('Delivery', money(venta.Costo_Delivery));
  t.lr('TOTAL', money(venta.Total), { b: true, h: 2 });
  if (documento && Number(documento.Impuesto) > 0) t.lr('Neto / Impuesto', `${money(documento.Neto)} / ${money(documento.Impuesto)}`);
  t.lr('Pago', `${venta.Metodo_Pago} (${venta.Estado_Pago})`);
  t.hr();
  t.p('¡Gracias por su compra!', { a: 'c' });
  if (pendiente) t.p(`No es ${tipo === 'Ticket' ? 'ticket de pago' : tipo.toLowerCase()}: se emitirá al recibir el pago`, { a: 'c' });
  else if (tipo !== 'Ticket') t.p('Comprobante interno sin validez tributaria', { a: 'c' });
  return cierre(t, pr).bytes();
}

export function comanda(data, ctx, pr) {
  const { venta, detalle } = data;
  const t = nuevo(pr);
  const lineas = detalle.filter((d) => String(d.Va_A_Cocina).toUpperCase() !== 'FALSE');
  t.p('COMANDA', { a: 'c', b: true, w: 2, h: 2 });
  t.p(venta.Tipo_Entrega, { a: 'c', b: true });
  if (venta.Referencia) t.p(venta.Referencia, { a: 'c', b: true, w: 2, h: 2 });
  t.lr('Pedido', venta.ID_Venta).lr('Hora', ctx.fecha(venta.Fecha_Hora));
  t.hr();
  for (const d of lineas) {
    t.p(`${Number(d.Cantidad)} x ${d.Nombre_Producto}`, { b: true, h: 2 });
    if (d.Nota) t.p('> ' + d.Nota);
  }
  if (!lineas.length) t.p('Sin productos para cocina', { a: 'c' });
  if (venta.Nota_Cocina) { t.hr(); t.p('NOTA: ' + venta.Nota_Cocina, { b: true }); }
  return cierre(t, pr).bytes();
}

export function prueba(pr, nombre = 'Prueba') {
  const t = nuevo(pr);
  t.p('IMPRESION DE PRUEBA', { a: 'c', b: true });
  t.p(nombre, { a: 'c' });
  t.lr('Papel', (pr.papel || '80') + ' mm').lr('Columnas', String(colsDe(pr)));
  t.p('1234567890'.repeat(5).slice(0, colsDe(pr)));
  t.p('áéíóú ñ Ñ ¿? ¡! €', { a: 'c' });
  t.p('Si ves esto completo y el papel sale cortado, la impresora quedó bien configurada.', { a: 'c' });
  return cierre(t, pr).bytes();
}
