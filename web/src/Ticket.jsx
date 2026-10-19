import { useAuth } from './auth.jsx';
import { useFmt, fdt } from './ui.jsx';

// Datos de impresión del formato: la hoja se arma al imprimir (ver imprimir() en ui.jsx) con el ancho real del papel
// y la altura exacta del ticket, para que salga UNA sola hoja. MARGEN_INFERIOR_MM = espacio al final para que el papel avance hasta la cuchilla.
export function usePrintCfg(fmt) {
  const { config } = useAuth();
  const raw = config.MARGEN_INFERIOR_MM;
  const fin = Math.max(0, Math.min(60, Number(raw === undefined || raw === '' ? 15 : raw) || 0));
  return { 'data-fmt': fmt, 'data-fin': fin };
}

// Comprobante interno. Formatos: térmica 58 mm, térmica 80 mm o A4/Carta. Imprime con el diálogo del navegador.
export default function Ticket({ data, formato }) {
  const { config, brand } = useAuth();
  const { money } = useFmt();
  const { venta, detalle, documento, cliente } = data;
  const fmt = formato || (documento && documento.Formato) || config.FORMATO_DOC_DEFECTO || 'Termica 80mm';
  const cls = fmt.includes('58') ? 't58' : fmt.includes('A4') ? 'a4' : '';
  const tipo = (documento && documento.Tipo) || venta.Tipo_Documento || 'Ticket';
  const pc = usePrintCfg(fmt);
  const pendiente = !documento || venta.Estado_Pago !== 'Pagado';  // aún no se emite boleta/factura
  return (
    <>
      <div className="print-area" {...pc}>
        <div className={'ticket ' + cls}>
          {brand.LOGO && <img className="tl" src={brand.LOGO} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          <h3>{brand.NOMBRE_NEGOCIO}</h3>
          {config.DOCUMENTO_NEGOCIO && <div className="c">{config.DOCUMENTO_NEGOCIO}</div>}
          {config.DIRECCION_NEGOCIO && <div className="c">{config.DIRECCION_NEGOCIO}</div>}
          <hr />
          {pendiente
            ? <div className="c" style={{ border: '2px solid #000', padding: 3 }}><b>PEDIDO · PAGO {String(venta.Estado_Pago || 'Pendiente').toUpperCase()}</b></div>
            : <div className="l"><b>{tipo.toUpperCase()} N° {documento.Folio}</b></div>}
          <div className="l"><span>Venta</span><span>{venta.ID_Venta}</span></div>
          <div className="l"><span>Fecha</span><span>{fdt(venta.Fecha_Hora)}</span></div>
          {cliente && <div className="l"><span>Cliente</span><span>{cliente.Nombre}</span></div>}
          {cliente && cliente.Documento && <div className="l"><span>Doc.</span><span>{cliente.Documento}</span></div>}
          <hr />
          {detalle.map((d) => (
            <div key={d.ID_Detalle} style={{ marginBottom: 3 }}>
              <div>{d.Nombre_Producto}</div>
              <div className="l"><span>{Number(d.Cantidad)} x {money(d.Precio_Unitario)}</span><span>{money(d.Subtotal)}</span></div>
            </div>))}
          <hr />
          <div className="l"><span>Subtotal</span><span>{money(venta.Subtotal)}</span></div>
          {Number(venta.Descuento) > 0 && <div className="l"><span>Descuento</span><span>-{money(venta.Descuento)}</span></div>}
          {Number(venta.Costo_Delivery) > 0 && <div className="l"><span>Delivery</span><span>{money(venta.Costo_Delivery)}</span></div>}
          <div className="l" style={{ fontSize: '1.15em' }}><b>TOTAL</b><b>{money(venta.Total)}</b></div>
          {documento && Number(documento.Impuesto) > 0 && <div className="l"><span>Neto / Impuesto</span><span>{money(documento.Neto)} / {money(documento.Impuesto)}</span></div>}
          <div className="l"><span>Pago</span><span>{venta.Metodo_Pago} ({venta.Estado_Pago})</span></div>
          <hr />
          <div className="c">¡Gracias por su compra!</div>
          {pendiente && <div className="c" style={{ fontSize: '.8em', marginTop: 4 }}>No es {tipo === 'Ticket' ? 'ticket de pago' : tipo.toLowerCase()}: se emitirá al recibir el pago</div>}
          {!pendiente && tipo !== 'Ticket' && <div className="c" style={{ fontSize: '.8em', marginTop: 4 }}>Comprobante interno sin validez tributaria</div>}
        </div>
      </div>
    </>
  );
}
