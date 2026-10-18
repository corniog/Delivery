import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import { fdt, imprimir, useToast } from './ui.jsx';
import Ticket, { PrintStyle } from './Ticket.jsx';

// Ticket de cocina: sin precios, con referencia, notas y solo los productos marcados "Va a cocina".
export function Comanda({ data }) {
  const { config } = useAuth();
  const { venta, detalle } = data;
  const fmt = config.FORMATO_COMANDA || config.FORMATO_DOC_DEFECTO || 'Termica 80mm';
  const cls = fmt.includes('58') ? 't58' : fmt.includes('A4') ? 'a4' : '';
  const lineas = detalle.filter((d) => String(d.Va_A_Cocina).toUpperCase() !== 'FALSE');
  return (
    <>
      <PrintStyle fmt={fmt} />
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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const esNativa = () => { const cap = window.Capacitor; return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()); };

// Cuerpo común de los modales de venta: pestañas Comprobante / Comanda y botón Imprimir de la pestaña activa.
// auto: 'ambos' | 'venta' | 'comanda' → se envía a imprimir solo al abrir. "Ambos" son DOS impresiones separadas, una tras otra
// (comanda y luego comprobante), cada una con su propio ticket y su propio diálogo de impresora.
export function Comprobantes({ data, extra, onClose, inicial, auto }) {
  const { cocina, config } = useAuth();
  const toast = useToast();
  const plan = auto === 'ambos' ? ['comanda', 'venta'] : auto === 'comanda' ? ['comanda'] : auto === 'venta' ? ['venta'] : [];
  const [tab, setTab] = useState(plan[0] || inicial || 'venta');
  const [siguiente, setSiguiente] = useState(null);   // en la APK cada impresión necesita su propio toque
  const [ocupado, setOcupado] = useState(false);
  const pendiente = data.venta.Estado_Pago !== 'Pagado';
  const nombre = (t) => (t === 'comanda' ? 'Comanda ' : 'Venta ') + data.venta.ID_Venta;
  const impresora = (t) => (t === 'comanda' ? config.IMPRESORA_COMANDA : config.IMPRESORA_COMPROBANTE) || '';
  const imprimirTab = async (t) => { setTab(t); await esperar(600); await imprimir(nombre(t)); };
  const secuencia = async (lista) => {
    setOcupado(true);
    try {
      for (let i = 0; i < lista.length; i++) {
        await imprimirTab(lista[i]);
        if (i < lista.length - 1) {
          if (esNativa()) { setSiguiente(lista[i + 1]); return; }
          await esperar(400);
        }
      }
      setSiguiente(null);
    } catch (e) { toast(e.message, true); } finally { setOcupado(false); }
  };
  const hecho = useRef(false);
  useEffect(() => {
    if (!plan.length || hecho.current) return;
    hecho.current = true;
    const t = setTimeout(() => secuencia(plan), 500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const imp = impresora(tab);
  return (
    <>
      {plan.length > 0 && ocupado && <p className="muted small no-print" style={{ marginTop: 0 }}>Imprimiendo{plan.length > 1 ? ' (primero la comanda, después el comprobante)' : ''}…</p>}
      <div className="row no-print" style={{ marginBottom: 8 }}>
        <button className={'btn' + (tab === 'venta' ? ' primary' : '')} disabled={ocupado} onClick={() => setTab('venta')}>{pendiente ? 'Pedido (por cobrar)' : 'Comprobante'}</button>
        {cocina && <button className={'btn' + (tab === 'comanda' ? ' primary' : '')} disabled={ocupado} onClick={() => setTab('comanda')}>Comanda cocina</button>}
      </div>
      {tab === 'venta' && <Ticket data={data} />}
      {tab === 'comanda' && <Comanda data={data} />}
      <p className="muted small no-print">{imp ? <>Impresora: <b>{imp}</b>. </> : null}{tab === 'comanda' ? 'En el diálogo de impresión elige la impresora de cocina.' : 'En el diálogo de impresión elige la impresora de caja.'}</p>
      <div className="row no-print" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        {extra}
        {onClose && <button className="btn" onClick={onClose}>Cerrar</button>}
        {siguiente && <button className="btn primary" disabled={ocupado} onClick={() => secuencia([siguiente])}>Siguiente: imprimir {siguiente === 'comanda' ? 'comanda' : 'comprobante'}</button>}
        {plan.length > 1 && !siguiente && <button className="btn" disabled={ocupado} onClick={() => secuencia(plan)}>Imprimir los dos</button>}
        <button className={'btn' + (siguiente ? '' : ' primary')} disabled={ocupado} onClick={() => secuencia([tab])}>
          {tab === 'venta' ? (pendiente ? 'Imprimir pedido' : 'Imprimir comprobante') : 'Imprimir comanda'}
        </button>
      </div>
    </>
  );
}
