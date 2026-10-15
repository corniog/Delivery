import { useState } from 'react';
import Crud from '../Crud.jsx';
import { call } from '../api.js';
import { Modal, useFmt, useToast, fdt } from '../ui.jsx';
import { useAuth } from '../auth.jsx';

export function Productos() {
  const { money } = useFmt();
  const [adj, setAdj] = useState(null);
  return (
    <>
      <Crud
        title="Inventario" tabla="Productos" module="Inventario" idKey="ID_Producto"
        searchKeys={['Nombre', 'Codigo_Barras', 'SKU']} defaults={{ Activo: true, Stock_Actual: 0, Stock_Minimo: 0, Unidad_Medida: 'Unidad' }}
        filterRef={{ ref: 'Categorias', refKey: 'ID_Categoria', key: 'ID_Categoria', label: 'Categoría' }}
        rowClass={(r) => (Number(r.Stock_Actual) <= Number(r.Stock_Minimo) ? 'low' : '')}
        fields={[
          { key: 'Nombre', label: 'Nombre', required: true },
          { key: 'Codigo_Barras', label: 'Código de barras', type: 'barcode' },
          { key: 'SKU', label: 'SKU / código interno' },
          { key: 'ID_Categoria', label: 'Categoría', type: 'ref', ref: 'Categorias', refKey: 'ID_Categoria' },
          { key: 'Unidad_Medida', label: 'Unidad de medida', type: 'ref', ref: 'Unidades', refKey: 'Unidad', refLabel: 'Unidad' },
          { key: 'Precio_Compra', label: 'Precio de compra', type: 'number' },
          { key: 'Precio_Venta', label: 'Precio de venta', type: 'number', required: true },
          { key: 'Stock_Actual', label: 'Stock inicial', type: 'number', onlyCreate: true },
          { key: 'Stock_Minimo', label: 'Stock mínimo (alerta)', type: 'number' },
          { key: 'ID_Proveedor', label: 'Proveedor', type: 'ref', ref: 'Proveedores', refKey: 'ID_Proveedor' },
          { key: 'Activo', label: 'Disponible para venta', type: 'bool' },
          { key: 'Imagen', label: 'Imagen', type: 'image' }
        ]}
        columns={[
          { key: 'Imagen', label: '', type: 'image' },
          { key: 'Nombre', label: 'Producto' },
          { key: 'ID_Categoria', label: 'Categoría', type: 'ref', ref: 'Categorias', refKey: 'ID_Categoria' },
          { key: 'Precio_Venta', label: 'Precio', render: (r) => money(r.Precio_Venta) },
          { key: 'Stock_Actual', label: 'Stock', render: (r) => <span>{Number(r.Stock_Actual)} {r.Unidad_Medida} {Number(r.Stock_Actual) <= Number(r.Stock_Minimo) && <span className="badge bad">Bajo</span>}</span> },
          { key: 'Stock_Minimo', label: 'Mínimo' }
        ]}
        extraActions={(r, reload) => <PermBtn onClick={() => setAdj({ r, reload })} />}
      />
      {adj && <StockModal {...adj} onClose={() => setAdj(null)} />}
    </>
  );
}
function PermBtn({ onClick }) {
  const { can } = useAuth();
  return can('Inventario', 'Editar') ? <button className="btn sm" onClick={onClick}>Stock</button> : null;
}
function StockModal({ r, reload, onClose }) {
  const toast = useToast();
  const [tipo, setTipo] = useState('Entrada compra');
  const [cant, setCant] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await call('ajustarStock', { ID_Producto: r.ID_Producto, tipo, cantidad: tipo === 'Ajuste' ? undefined : Number(cant), nuevoStock: tipo === 'Ajuste' ? Number(cant) : undefined, nota });
      toast('Stock actualizado'); reload(); onClose();
    } catch (x) { toast(x.message, true); setBusy(false); }
  };
  return (
    <Modal title={'Stock: ' + r.Nombre} onClose={onClose}>
      <form className="stack" onSubmit={go}>
        <p className="muted">Stock actual: <b>{Number(r.Stock_Actual)} {r.Unidad_Medida}</b></p>
        <label className="f">Movimiento
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="Entrada compra">Entrada (llegó mercadería)</option><option value="Merma">Merma / pérdida</option><option value="Ajuste">Ajuste (fijar stock exacto)</option>
          </select></label>
        <label className="f">{tipo === 'Ajuste' ? 'Nuevo stock' : 'Cantidad'}<input className="input" type="number" step="any" min="0" required value={cant} onChange={(e) => setCant(e.target.value)} /></label>
        <label className="f">Nota<input className="input" value={nota} onChange={(e) => setNota(e.target.value)} /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Guardar</button></div>
      </form>
    </Modal>
  );
}

export const Categorias = () => (
  <Crud title="Categorías" tabla="Categorias" module="Categorias" idKey="ID_Categoria" searchKeys={['Nombre']} defaults={{ Activo: true, Orden: 1 }}
    fields={[
      { key: 'Nombre', label: 'Nombre', required: true }, { key: 'Orden', label: 'Orden', type: 'number' },
      { key: 'Activo', label: 'Visible en ventas', type: 'bool' }, { key: 'Imagen', label: 'Imagen de la categoría', type: 'image' }
    ]}
    columns={[{ key: 'Imagen', label: '', type: 'image' }, { key: 'Nombre', label: 'Nombre' }, { key: 'Orden', label: 'Orden' }, { key: 'Activo', label: 'Visible', type: 'bool' }]} />
);

export const Clientes = () => (
  <Crud title="Clientes" tabla="Clientes" module="Clientes" idKey="ID_Cliente" searchKeys={['Nombre', 'Telefono', 'Documento', 'Email', 'Direccion']}
    fields={[
      { key: 'Nombre', label: 'Nombre', required: true }, { key: 'Documento', label: 'RUT / documento' },
      { key: 'Telefono', label: 'Teléfono' }, { key: 'Email', label: 'Correo' },
      { key: 'Direccion', label: 'Dirección' }, { key: 'Ubicacion', label: 'Coordenadas (lat,long)' },
      { key: 'Notas', label: 'Notas', type: 'textarea' }
    ]}
    columns={[{ key: 'Nombre', label: 'Cliente' }, { key: 'Telefono', label: 'Teléfono' }, { key: 'Direccion', label: 'Dirección' }, { key: 'Email', label: 'Correo' }]} />
);

const DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
export const Proveedores = () => (
  <Crud title="Proveedores" tabla="Proveedores" module="Proveedores" idKey="ID_Proveedor" searchKeys={['Nombre', 'Contacto', 'Telefono', 'Dias_Visita']}
    fields={[
      { key: 'Nombre', label: 'Empresa / nombre', required: true }, { key: 'Documento', label: 'RUT / documento' },
      { key: 'Contacto', label: 'Persona de contacto' }, { key: 'Telefono', label: 'Teléfono' },
      { key: 'Email', label: 'Correo' }, { key: 'Direccion', label: 'Dirección' },
      { key: 'Dias_Visita', label: 'Días que visita el local', type: 'multi', options: DIAS },
      { key: 'Ultima_Visita', label: 'Última visita', type: 'date' }, { key: 'Proxima_Visita', label: 'Próxima visita', type: 'date' },
      { key: 'Notas', label: 'Notas (plazos de pago, condiciones)', type: 'textarea' }
    ]}
    columns={[{ key: 'Nombre', label: 'Proveedor' }, { key: 'Contacto', label: 'Contacto' }, { key: 'Telefono', label: 'Teléfono' },
      { key: 'Dias_Visita', label: 'Visita' }, { key: 'Proxima_Visita', label: 'Próxima visita', type: 'date' }]} />
);

export const Unidades = () => (
  <Crud title="Unidades de medida" tabla="Unidades" module="Inventario" idKey="Unidad" searchKeys={['Unidad']} hideTitle
    fields={[{ key: 'Unidad', label: 'Unidad', required: true, onlyCreate: true }, { key: 'Abreviatura', label: 'Abreviatura' }]}
    columns={[{ key: 'Unidad', label: 'Unidad' }, { key: 'Abreviatura', label: 'Abreviatura' }]} />
);

export function Conocimiento() {
  const [tab, setTab] = useState('docs');
  return (
    <div className="stack">
      <div className="pagehead"><h1>Base de conocimiento</h1></div>
      <div className="tabs"><button className={tab === 'docs' ? 'on' : ''} onClick={() => setTab('docs')}>Documentos</button><button className={tab === 'cat' ? 'on' : ''} onClick={() => setTab('cat')}>Categorías</button></div>
      {tab === 'docs' ? (
        <Crud title="Documento" tabla="Conocimiento" module="Conocimiento" idKey="ID_Conocimiento" hideTitle newLabel="Subir documento" searchKeys={['Titulo', 'Descripcion', 'Etiquetas']}
          filterRef={{ ref: 'Categorias_Conocimiento', refKey: 'ID_CatCon', key: 'ID_CatCon', label: 'Categoría' }}
          fields={[
            { key: 'Titulo', label: 'Título', required: true },
            { key: 'ID_CatCon', label: 'Categoría', type: 'ref', ref: 'Categorias_Conocimiento', refKey: 'ID_CatCon' },
            { key: 'Archivo_PDF', label: 'Archivo PDF', type: 'pdf', required: true },
            { key: 'Etiquetas', label: 'Etiquetas (separadas por coma)' },
            { key: 'Descripcion', label: 'Descripción', type: 'textarea' }
          ]}
          columns={[
            { key: 'Titulo', label: 'Título' }, { key: 'ID_CatCon', label: 'Categoría', type: 'ref', ref: 'Categorias_Conocimiento', refKey: 'ID_CatCon' },
            { key: 'Etiquetas', label: 'Etiquetas' }, { key: 'Fecha', label: 'Fecha', render: (r) => fdt(r.Fecha) },
            { key: 'Archivo_PDF', label: 'PDF', render: (r) => (r.Archivo_PDF ? <a href={r.Archivo_PDF} target="_blank" rel="noreferrer">Abrir PDF</a> : '') }
          ]} />
      ) : (
        <Crud title="Categoría" tabla="Categorias_Conocimiento" module="Conocimiento" idKey="ID_CatCon" hideTitle searchKeys={['Nombre']}
          fields={[{ key: 'Nombre', label: 'Nombre', required: true }, { key: 'Imagen', label: 'Imagen', type: 'image' }]}
          columns={[{ key: 'Imagen', label: '', type: 'image' }, { key: 'Nombre', label: 'Nombre' }]} />
      )}
    </div>
  );
}
