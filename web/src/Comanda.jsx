import { useState } from 'react';
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

// Cuerpo común de los modales de venta: pestañas Comprobante / Comanda y botón Imprimir de la pestaña activa.
export function Comprobantes({ data, extra, onClose, inicial }) {
  const { config } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState(inicial || 'venta');
  const nombre = (tab === 'venta' ? 'Venta ' : 'Comanda ') + data.venta.ID_Venta;
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 8 }}>
        <button className={'btn' + (tab === 'venta' ? ' primary' : '')} onClick={() => setTab('venta')}>Comprobante</button>
        <button className={'btn' + (tab === 'comanda' ? ' primary' : '')} onClick={() => setTab('comanda')}>Comanda cocina</button>
      </div>
      {tab === 'venta' ? <Ticket data={data} /> : <Comanda data={data} />}
      {tab === 'comanda' && <p className="muted small no-print">Para la cocina: en el diálogo de impresión elige la impresora de cocina.</p>}
      <div className="row no-print" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        {extra}
        {onClose && <button className="btn" onClick={onClose}>Cerrar</button>}
        <button className="btn primary" onClick={() => imprimir(nombre).catch((e) => toast(e.message, true))}>
          {tab === 'venta' ? 'Imprimir comprobante' : 'Imprimir comanda'}
        </button>
      </div>
    </>
  );
}
