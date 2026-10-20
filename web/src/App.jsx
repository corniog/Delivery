import { useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { ToastProvider, Icon, Brand, Modal } from './ui.jsx';
import { getApiUrl, setApiUrl } from './api.js';
import Login from './Login.jsx';
import Blocked from './Blocked.jsx';
import Compras from './pages/Compras.jsx';
import Sell from './pages/Sell.jsx';
import { Productos, Categorias, Clientes, Proveedores, Conocimiento } from './pages/Simple.jsx';
import Delivery from './pages/Delivery.jsx';
import { Dashboard, Historial, Kpi, Reportes } from './pages/Insights.jsx';
import { Usuarios, Configuracion, Cuenta } from './pages/Admin.jsx';

const NAV = [
  { to: '/', label: 'Inicio', icon: 'home', show: () => true, end: true },
  { to: '/vender', label: 'Vender', icon: 'cart', show: (c) => c('Ventas', 'Crear') },
  { to: '/inventario', label: 'Inventario', icon: 'box', show: (c) => c('Inventario', 'Ver') },
  { to: '/categorias', label: 'Categorías', icon: 'tag', show: (c) => c('Categorias', 'Ver') },
  { to: '/clientes', label: 'Clientes', icon: 'users', show: (c) => c('Clientes', 'Ver') },
  { to: '/proveedores', label: 'Proveedores', icon: 'store', show: (c, d, f) => c('Proveedores', 'Ver') && f('compras') },
  { to: '/compras', label: 'Compras', icon: 'bag', show: (c, d, f) => c('Proveedores', 'Ver') && !d && f('compras') },
  { to: '/delivery', label: 'Delivery', icon: 'truck', show: (c, d, f) => c('Delivery', 'Ver') && f('delivery') },
  { to: '/historial', label: 'Historial', icon: 'clock', show: (c, d) => c('Historial', 'Ver') && !d },
  { to: '/conocimiento', label: 'Conocimiento', icon: 'book', show: (c, d, f) => c('Conocimiento', 'Ver') && f('conocimiento') },
  { to: '/kpi', label: 'KPI', icon: 'chart', show: (c, d, f) => c('KPI', 'Ver') && f('kpi') },
  { to: '/reportes', label: 'Reportes', icon: 'file', show: (c, d, f) => c('Reportes', 'Exportar') && f('reportes') },
  { to: '/usuarios', label: 'Usuarios', icon: 'shield', show: (c) => c('Usuarios', 'Ver') },
  { to: '/configuracion', label: 'Configuración', icon: 'gear', show: (c) => c('Configuracion', 'Ver') },
  { to: '/cuenta', label: 'Mi cuenta', icon: 'user', show: () => true }
];

function Shell() {
  const { user, can, feat, isDelivery, brand, logout, salirCompleto } = useAuth();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const items = NAV.filter((n) => n.show(can, isDelivery, feat));
  const bottom = items.filter((n) => ['/', '/vender', '/inventario', '/delivery'].includes(n.to)).slice(0, 4);
  const Link = ({ n, onClick }) => <NavLink to={n.to} end={n.end} onClick={onClick}><Icon n={n.icon} />{n.label}</NavLink>;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Brand /><div><b>{brand.NOMBRE_NEGOCIO}</b><span className="muted small">{user.Nombre}</span></div></div>
        <nav className="nav" style={{ flex: 1 }}>{items.map((n) => <Link key={n.to} n={n} />)}</nav>
        <nav className="nav"><button onClick={logout}><Icon n="out" />Cerrar sesión</button><button onClick={salirCompleto}><Icon n="out" />Salir completamente</button></nav>
      </aside>
      <header className="topbar"><Brand size={32} /><b className="grow">{brand.NOMBRE_NEGOCIO}</b></header>
      <main className="main">
        <Routes>
          <Route path="/" element={isDelivery ? <Navigate to="/delivery" replace /> : <Dashboard />} />
          <Route path="/vender" element={<Guard ok={can('Ventas', 'Crear')}><Sell /></Guard>} />
          <Route path="/inventario" element={<Guard ok={can('Inventario', 'Ver')}><Productos /></Guard>} />
          <Route path="/categorias" element={<Guard ok={can('Categorias', 'Ver')}><Categorias /></Guard>} />
          <Route path="/clientes" element={<Guard ok={can('Clientes', 'Ver')}><Clientes /></Guard>} />
          <Route path="/proveedores" element={<Guard ok={can('Proveedores', 'Ver') && feat('compras')}><Proveedores /></Guard>} />
          <Route path="/compras" element={<Guard ok={can('Proveedores', 'Ver') && !isDelivery && feat('compras')}><Compras /></Guard>} />
          <Route path="/delivery" element={<Guard ok={can('Delivery', 'Ver') && feat('delivery')}><Delivery /></Guard>} />
          <Route path="/historial" element={<Guard ok={can('Historial', 'Ver') && !isDelivery}><Historial /></Guard>} />
          <Route path="/conocimiento" element={<Guard ok={can('Conocimiento', 'Ver') && feat('conocimiento')}><Conocimiento /></Guard>} />
          <Route path="/kpi" element={<Guard ok={can('KPI', 'Ver') && feat('kpi')}><Kpi /></Guard>} />
          <Route path="/reportes" element={<Guard ok={can('Reportes', 'Exportar') && feat('reportes')}><Reportes /></Guard>} />
          <Route path="/usuarios" element={<Guard ok={can('Usuarios', 'Ver')}><Usuarios /></Guard>} />
          <Route path="/configuracion" element={<Guard ok={can('Configuracion', 'Ver')}><Configuracion /></Guard>} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="bottombar">
        {bottom.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon n={n.icon} />{n.label}</NavLink>)}
        <button onClick={() => setMenu(true)}><Icon n="menu" />Menú</button>
      </nav>
      {menu && (
        <Modal title="Menú" onClose={() => setMenu(false)}>
          <nav className="nav">{items.map((n) => <Link key={n.to} n={n} onClick={() => setMenu(false)} />)}<button onClick={logout}><Icon n="out" />Cerrar sesión</button><button onClick={salirCompleto}><Icon n="out" />Salir completamente</button></nav>
        </Modal>)}
      <span hidden>{loc.pathname}</span>
    </div>
  );
}
const Guard = ({ ok, children }) => (ok ? children : <div className="card">No tienes permiso para ver esta sección.</div>);

function Gate() {
  const { ready, user, licencia } = useAuth();
  if (licencia && licencia.bloqueada) return <Blocked />;
  if (!ready) return <div className="login"><p className="muted">Cargando…</p></div>;
  return user ? <Shell /> : <Login />;
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider><AuthProvider><Gate /></AuthProvider></ToastProvider>
    </HashRouter>
  );
}
