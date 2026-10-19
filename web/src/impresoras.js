// Impresoras guardadas en este dispositivo (APK). Cada impresora sabe qué imprime (comprobantes y/o comandas) y se usa sin diálogos.
import { base64 } from './escpos.js';

const K = 'impresoras';
export const esNativa = () => { const c = window.Capacitor; return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); };
const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.EscPos) || null;
export const hayDirecta = () => esNativa() && !!plugin();

export function getImpresoras() {
  try { const l = JSON.parse(localStorage.getItem(K) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
export function setImpresoras(l) { try { localStorage.setItem(K, JSON.stringify(l)); } catch { /* sin almacenamiento */ } }
export const paraRol = (rol) => (hayDirecta() ? getImpresoras().filter((p) => p.activa !== false && (p.roles || []).includes(rol)) : []);

export const PLANTILLAS = {
  usb: { papel: '80', corte: true, tildes: true, avance: 3 },
  red: { papel: '80', corte: true, tildes: true, avance: 3 },
  bluetooth: { papel: '58', corte: false, tildes: false, avance: 18 }
};
export const TIPOS = { bluetooth: 'Bluetooth', usb: 'USB', red: 'Red (WiFi / cable de red)' };

export async function listar(tipo) {
  const p = plugin();
  if (!p) throw new Error('Esta APK no incluye la impresión directa. Instala la APK más reciente.');
  const r = await (tipo === 'usb' ? p.listarUsb() : p.listarBluetooth());
  return r.dispositivos || [];
}
export async function enviar(impresora, bytes) {
  const p = plugin();
  if (!p) throw new Error('Esta APK no incluye la impresión directa. Instala la APK más reciente.');
  await p.imprimir({ tipo: impresora.tipo, direccion: impresora.direccion, datos: base64(bytes) });
}
