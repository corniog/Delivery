import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import { fdt, imprimir, useToast } from './ui.jsx';
import Ticket from './Ticket.jsx';

// Ticket de cocina: sin precios, con referencia, notas y solo los productos marcados "Va a cocina".
export function Comanda({ data }) {
  const { config } = useAuth();
  const { venta, detalle } = data;
  const fmt = config.FORMATO_COMANDA || config.FORMATO_DOC_DEFECTO || 'Termica 80mm';
  const cls = fmt.includes('58') ? 't58' : fmt.includes('A4') ? 'a4' : '';
  const lineas = detalle.filter((d) => String(d.Va_A_Cocina).toUpperCase() !== 'FALSE');
  return (
    <>
      <style>{`@media print{@page{size:${fmt.includes('58') ? '58mm auto' : fmt.includes('A4') ? 'A4' : '80mm auto'};margin:${fmt.includes('A4') ? '10mm' : '2mm'}}}`}</style>
      <div className="print-area">
        <div className={'ticket ' + cls} style={{ fontSize: '1.1em' }}>
          <h3>COMANDA</h3>
          <div className="c"><b>{venta.Tipo_Entrega}</b></div>
          {venta.Referencia && <div className="c" style={{ fontSize: '1.4em' }}><b>{venta.Referencia}</b></div>}
          <div className="l"><span>Pedido</span><span>{venta.ID_Venta}</span></div>
          <div className="l"><span>Hora</span><span>{fdt(venta.Fecha_Hora)}</span></div>
          <hr />
          {lineas.map((d) => (
            <div key={d.ID_Detalle} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: '1.2em' }}><b>{Number(d.Cantidad)} x</b> {d.Nombre_Producto}</div>
              {d.Nota && <div>» {d.Nota}</div>}
            </div>))}
          {!lineas.length && <div className="c">Sin productos para cocina</div>}
          {venta.Nota_Cocina && (<><hr /><div><b>NOTA:</b> {venta.Nota_Cocina}</div></>)}
        </div>
      </div>
    </>
  );
}

// Qué imprimir automáticamente al confirmar una venta (se elige en Configuración).
export function modoImpresion(config, cocina) {
  const raw = String(config.IMPRESION_AL_VENDER || '').trim();
  let m = { 'Comanda y comprobante': 'ambos', 'Solo comprobante': 'venta', 'Solo comanda': 'comanda', 'No imprimir': 'nada', 'Preguntar': 'preguntar' }[raw];
  if (!m) m = String(config.COMANDA_AUTO).toUpperCase() === 'TRUE' ? 'comanda' : 'preguntar';   // compatibilidad con la opción anterior
  if (!cocina) { if (m === 'ambos') m = 'venta'; else if (m === 'comanda') m = 'nada'; }
  return m;
}

// Cuerpo común de los modales de venta: pestañas Comprobante / Comanda (y "Ambos" al vender) y botón Imprimir de la pestaña activa.
// auto: 'ambos' | 'venta' | 'comanda' → se envía a imprimir solo al abrir. Sin auto (historial) se imprime cada uno por separado.
export function Comprobantes({ data, extra, onClose, inicial, auto }) {
  const { cocina } = useAuth();
  const toast = useToast();
  const auto1 = auto && auto !== 'nada' && auto !== 'preguntar' ? auto : null;
  const [tab, setTab] = useState(auto1 === 'ambos' ? 'ambos' : auto1 === 'comanda' ? 'comanda' : (inicial || 'venta'));
  const pendiente = data.venta.Estado_Pago !== 'Pagado';
  const nombre = (tab === 'comanda' ? 'Comanda ' : 'Venta ') + data.venta.ID_Venta;
  const hecho = useRef(false);
  useEffect(() => {
    if (!auto1 || hecho.current) return;
    hecho.current = true;
    const t = setTimeout(() => imprimir('Venta ' + data.venta.ID_Venta).catch((e) => toast(e.message, true)), 700);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {auto1 && <p className="muted small no-print" style={{ marginTop: 0 }}>Enviando a imprimir… Si no salió, pulsa Imprimir.</p>}
      <div className="row no-print" style={{ marginBottom: 8 }}>
        <button className={'btn' + (tab === 'venta' ? ' primary' : '')} onClick={() => setTab('venta')}>{pendiente ? 'Pedido (por cobrar)' : 'Comprobante'}</button>
        {cocina && <button className={'btn' + (tab === 'comanda' ? ' primary' : '')} onClick={() => setTab('comanda')}>Comanda cocina</button>}
        {cocina && auto1 === 'ambos' && <button className={'btn' + (tab === 'ambos' ? ' primary' : '')} onClick={() => setTab('ambos')}>Ambos</button>}
      </div>
      {tab === 'venta' && <Ticket data={data} />}
      {tab === 'comanda' && <Comanda data={data} />}
      {tab === 'ambos' && <div className="print-area"><Comanda data={data} /><div className="print-break" /><Ticket data={data} /></div>}
      {tab === 'comanda' && <p className="muted small no-print">Para la cocina: en el diálogo de impresión elige la impresora de cocina.</p>}
      {tab === 'ambos' && <p className="muted small no-print">Sale primero la comanda y después el comprobante, en una sola impresión. Si la cocina tiene otra impresora, imprímelos por separado con las pestañas.</p>}
      <div className="row no-print" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        {extra}
        {onClose && <button className="btn" onClick={onClose}>Cerrar</button>}
        <button className="btn primary" onClick={() => imprimir(nombre).catch((e) => toast(e.message, true))}>
          {tab === 'venta' ? (pendiente ? 'Imprimir pedido' : 'Imprimir comprobante') : tab === 'comanda' ? 'Imprimir comanda' : 'Imprimir ambos'}
        </button>
      </div>
    </>
  );
}
