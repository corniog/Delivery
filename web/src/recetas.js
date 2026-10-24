// Recetas de productos preparados: unidades, conversiones, costos y cuántas porciones alcanzan.
const n = (u) => String(u || '').trim().toLowerCase();
const MASA = { kg: 1000, kilo: 1000, kilos: 1000, kilogramo: 1000, kilogramos: 1000, g: 1, gr: 1, gramo: 1, gramos: 1 };
const VOL = { l: 1000, lt: 1000, litro: 1000, litros: 1000, ml: 1, mililitro: 1, mililitros: 1 };

export const esPreparado = (p) => p && (p.Es_Preparado === true || String(p.Es_Preparado).toUpperCase() === 'TRUE');
export const familia = (u) => (n(u) in MASA ? 'masa' : n(u) in VOL ? 'vol' : 'otra');
const factor = (u) => MASA[n(u)] || VOL[n(u)] || 1;
const redondea = (x) => Math.round(x * 1e6) / 1e6;

// Unidades con las que se puede escribir la cantidad según la unidad del ingrediente en el inventario.
export function opcionesUnidad(unidadIng) {
  const f = familia(unidadIng);
  if (f === 'masa') return ['g', 'kg'];
  if (f === 'vol') return ['ml', 'lt'];
  return [unidadIng || 'Unidad'];
}
export const unidadInicial = (unidadIng) => opcionesUnidad(unidadIng)[0];

// Convierte lo que escribió el usuario (ej. 200 g) a la unidad del inventario (ej. 0.2 kg), que es la que se descuenta.
export function aUnidadInventario(cant, unidadEscrita, unidadIng) {
  const c = Number(cant) || 0;
  if (familia(unidadIng) !== 'otra' && familia(unidadEscrita) === familia(unidadIng)) return redondea((c * factor(unidadEscrita)) / factor(unidadIng));
  return redondea(c);
}

// { ID_Producto: [filas de Receta_Ingredientes] }
export function agrupar(rows) {
  const o = {};
  (rows || []).forEach((r) => { (o[r.ID_Producto] = o[r.ID_Producto] || []).push(r); });
  return o;
}

// Cuánto se descuenta de cada producto de inventario con un carrito { ID_Producto: cantidad }.
export function consumo(carrito, byId, recetas) {
  const used = {};
  Object.keys(carrito).forEach((id) => {
    const q = Number(carrito[id]) || 0;
    const p = byId[id];
    if (!p || !(q > 0)) return;
    if (esPreparado(p)) (recetas[id] || []).forEach((r) => { used[r.ID_Ingrediente] = (used[r.ID_Ingrediente] || 0) + q * Number(r.Cantidad); });
    else used[id] = (used[id] || 0) + q;
  });
  return used;
}

// Máximo que se puede vender de un producto, descontando lo que ya hay en el carrito para otros productos.
// Devuelve Infinity si se permite stock negativo.
export function maxVendible(p, byId, recetas, carrito, negativo) {
  if (negativo) return Infinity;
  const otros = { ...carrito }; delete otros[p.ID_Producto];
  const used = consumo(otros, byId, recetas);
  if (!esPreparado(p)) return Math.max(0, Math.round(((Number(p.Stock_Actual) || 0) - (used[p.ID_Producto] || 0)) * 1e4) / 1e4);
  const rec = recetas[p.ID_Producto] || [];
  if (!rec.length) return 0;
  let m = Infinity;
  rec.forEach((r) => {
    const ing = byId[r.ID_Ingrediente];
    const libre = (ing ? Number(ing.Stock_Actual) || 0 : 0) - (used[r.ID_Ingrediente] || 0);
    m = Math.min(m, Math.floor(libre / Number(r.Cantidad) + 1e-9));
  });
  return Math.max(0, m);
}

export const costoReceta = (filas, byId) => filas.reduce((s, r) => s + Number(r.Cantidad) * Number((byId[r.ID_Ingrediente] || {}).Precio_Compra || 0), 0);
