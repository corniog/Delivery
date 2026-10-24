// Compartir una compra a proveedor: mensaje (WhatsApp / correo) + ticket PDF.
import { jsPDF } from 'jspdf';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { fdt } from './ui.jsx';

const esNativa = () => { const c = window.Capacitor; return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); };
const num = (n) => Number(n) || 0;

// Número para wa.me: solo dígitos y con código de país. 9 dígitos (celular de Chile) → antepone 56.
export function telefonoWa(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^00/, '');
  if (d.length === 9) d = '56' + d;
  else if (d.length === 10 && d.startsWith('0')) d = '56' + d.slice(1);
  return d;
}

export function mensajeCompra(c, negocio, money) {
  const L = [];
  L.push(`Hola${c.Proveedor ? ' ' + c.Proveedor : ''}, te envío una solicitud de compra de *${negocio || 'mi negocio'}*:`);
  L.push('');
  L.push(`*Solicitud N° ${c.ID_Compra}*`);
  L.push(`Fecha: ${fdt(c.Fecha)}`);
  L.push('');
  (c.items || []).forEach((i) => L.push(`• ${i.Cantidad} × ${i.Nombre}${num(i.Costo_Unitario) ? ' — ' + money(i.Costo_Unitario) + ' c/u' : ''}`));
  L.push('');
  L.push(`*Total: ${money(c.Total)}*`);
  if (c.Nota) { L.push(''); L.push(`Nota: ${c.Nota}`); }
  L.push(''); L.push('Quedo atento a tu confirmación. ¡Gracias!');
  return L.join('\n');
}
export const asuntoCompra = (c, negocio) => `Solicitud de compra ${c.ID_Compra}${negocio ? ' - ' + negocio : ''}`;

export const linkWhatsApp = (c, texto) => {
  const tel = telefonoWa(c.TelefonoProveedor);
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
};
export const linkCorreo = (c, asunto, texto) => `mailto:${encodeURIComponent(c.EmailProveedor || '')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;

// Ticket PDF angosto (80 mm) con el largo justo.
export function ticketPdf(c, negocio, money) {
  const W = 80, M = 5, ancho = W - 2 * M;
  const medir = new jsPDF({ unit: 'mm', format: [W, 400] });
  medir.setFontSize(9);
  const filas = (c.items || []).map((i) => ({ i, nom: medir.splitTextToSize(String(i.Nombre || ''), ancho) }));
  const nota = c.Nota ? medir.splitTextToSize('Nota: ' + c.Nota, ancho) : [];
  const alto = 52 + filas.reduce((s, f) => s + 4.2 * f.nom.length + 4.6, 0) + nota.length * 4 + 18;
  const doc = new jsPDF({ unit: 'mm', format: [W, Math.max(alto, 80)] });
  let y = 8;
  const centro = (t, size, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.text(String(t), W / 2, y, { align: 'center' }); y += size * 0.5; };
  const linea = () => { doc.setDrawColor(150); doc.setLineDashPattern([0.8, 0.8], 0); doc.line(M, y, W - M, y); y += 3.5; };
  centro(negocio || 'Mi negocio', 12, true); y += 1;
  centro('SOLICITUD DE COMPRA', 10, true); y += 1;
  centro('N° ' + c.ID_Compra, 9); y += 1;
  linea();
  doc.setFontSize(9);
  const par = (a, b) => { doc.setFont('helvetica', 'bold'); doc.text(a, M, y); doc.setFont('helvetica', 'normal'); const t = doc.splitTextToSize(String(b || '—'), ancho - 18); doc.text(t, M + 18, y); y += 4.2 * t.length; };
  par('Fecha:', fdt(c.Fecha)); par('Proveedor:', c.Proveedor); par('Estado:', c.Estado);
  y += 1; linea();
  doc.setFont('helvetica', 'bold'); doc.text('Producto', M, y); doc.text('Subtotal', W - M, y, { align: 'right' }); y += 4.5;
  filas.forEach(({ i, nom }) => {
    doc.setFont('helvetica', 'normal'); doc.text(nom, M, y); y += 4.2 * nom.length;
    doc.setTextColor(90); doc.text(`${i.Cantidad} × ${money(i.Costo_Unitario)}`, M + 2, y);
    doc.setTextColor(0); doc.text(money(i.Subtotal), W - M, y, { align: 'right' }); y += 4.6;
  });
  linea();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('TOTAL', M, y); doc.text(money(c.Total), W - M, y, { align: 'right' }); y += 6;
  if (nota.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(nota, M, y); y += 4 * nota.length + 2; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
  doc.text('Gracias por tu atención', W / 2, y + 2, { align: 'center' });
  return doc;
}

export const nombreArchivo = (c) => `Solicitud-${c.ID_Compra}.pdf`;

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Abre el menú de compartir del teléfono con el PDF y el mensaje (ahí se elige WhatsApp, Gmail, etc.).
// Si el equipo no puede compartir archivos, descarga el PDF. Devuelve 'compartido' | 'descargado'.
export async function compartirPdf(c, negocio, money, texto) {
  const doc = ticketPdf(c, negocio, money);
  const nombre = nombreArchivo(c);
  if (esNativa()) {
    try {
      const data = doc.output('datauristring').split(',')[1];
      const f = await Filesystem.writeFile({ path: nombre, data, directory: Directory.Cache });
      await Share.share({ title: asuntoCompra(c, negocio), text: texto, files: [f.uri], dialogTitle: 'Enviar solicitud' });
      return 'compartido';
    } catch (e) {
      if (/cancel/i.test(String(e && (e.message || e)))) return 'cancelado';
      // APK antigua sin el plugin: se intenta con el navegador
    }
  }
  const blob = doc.output('blob');
  const file = new File([blob], nombre, { type: 'application/pdf' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: asuntoCompra(c, negocio), text: texto });
      return 'compartido';
    }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancelado'; }
  descargar(blob, nombre);
  return 'descargado';
}
