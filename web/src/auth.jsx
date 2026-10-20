import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { call, getToken, setToken, setNegocio } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null, perms: {}, config: {}, licencia: null, brand: { NOMBRE_NEGOCIO: 'Mi Negocio', LOGO: '' } });

  const applyMe = useCallback((me) => {
    if (me.negocio) setNegocio(me.negocio);
    setState({ ready: true, user: me.user, perms: me.perms, config: me.config, funciones: me.funciones || null, maxUsuarios: me.maxUsuarios || 0, brand: { NOMBRE_NEGOCIO: me.config.NOMBRE_NEGOCIO || 'Mi Negocio', LOGO: me.config.LOGO || '' } });
  }, []);

  const loadPublic = useCallback(async () => {
    try {
      const b = await call('publico');
      setState((s) => ({ ...s, ready: true, user: null, brand: { NOMBRE_NEGOCIO: b.NOMBRE_NEGOCIO, LOGO: b.LOGO }, licencia: b.licencia && b.licencia.bloqueada ? b.licencia : null }));
    } catch { setState((s) => ({ ...s, ready: true, user: null })); }
  }, []);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { applyMe(await call('me')); return; } catch { /* token vencido */ }
      }
      loadPublic();
    })();
    const onExpire = () => loadPublic();
    const onBlock = (e) => setState((s) => ({ ...s, ready: true, licencia: e.detail || { bloqueada: true, mensaje: 'Servicio bloqueado.' } }));
    window.addEventListener('auth-expired', onExpire);
    window.addEventListener('license-blocked', onBlock);
    return () => { window.removeEventListener('auth-expired', onExpire); window.removeEventListener('license-blocked', onBlock); };
  }, [applyMe, loadPublic]);

  // Marca: título, favicon y color en toda la app
  useEffect(() => {
    document.title = state.brand.NOMBRE_NEGOCIO || 'App Negocio';
    const link = document.querySelector('link[rel="icon"]');
    if (link && state.brand.LOGO) link.href = state.brand.LOGO;
    const col = state.config.COLOR_PRIMARIO;
    if (col && /^#[0-9a-f]{6}$/i.test(col)) document.documentElement.style.setProperty('--accent', col);
  }, [state.brand, state.config.COLOR_PRIMARIO]);

  const login = async (email, password) => {
    const r = await call('login', { email, password });
    setToken(r.token);
    window.location.hash = '#/';
    applyMe(r);
  };
  // Crea un negocio nuevo (solo Supabase) y entra directo, con 15 días de prueba
  const registrar = async (datos) => {
    const r = await call('registrar', datos);
    setToken(r.token);
    window.location.hash = '#/';
    applyMe(r);
  };
  const logout = async () => {
    try { await call('logout'); } catch { /* ignorar */ }
    setToken(null);
    window.location.hash = '#/';
    await loadPublic();
  };
  // "Salir completamente": además de cerrar sesión, olvida el negocio guardado en este dispositivo (vuelve a la pantalla inicial neutra)
  const salirCompleto = async () => {
    try { if (getToken()) await call('logout'); } catch { /* ignorar */ }
    setToken(null); setNegocio(null);
    try { const u = new URL(window.location.href); u.searchParams.delete('n'); u.hash = '#/'; window.history.replaceState(null, '', u.toString()); } catch { /* ignorar */ }
    setState((s) => ({ ...s, brand: { NOMBRE_NEGOCIO: 'App Negocio', LOGO: '' } }));
    await loadPublic();
  };
  const refresh = async () => applyMe(await call('me'));
  // Botón "Reintentar" de la pantalla de bloqueo: vuelve a consultar la licencia
  const recheck = async () => {
    const b = await call('publico', { refrescar: true });
    if (b.licencia && b.licencia.bloqueada) { setState((s) => ({ ...s, licencia: b.licencia })); return false; }
    setState((s) => ({ ...s, licencia: null }));
    if (getToken()) { try { applyMe(await call('me')); return true; } catch { /* pide login */ } }
    await loadPublic();
    return true;
  };
  const feat = (f) => !state.funciones || state.funciones.indexOf(f) >= 0;   // null = todas
  // Cocina activa = la función del plan + el interruptor del negocio en Configuración (por defecto activa)
  const cocina = feat('comanda') && String(state.config.COMANDA_ACTIVA ?? 'TRUE').toUpperCase() !== 'FALSE';
  const can = (mod, act = 'Ver') => !!(state.perms[mod] && state.perms[mod][act]);
  const isDelivery = !!(state.user && state.user.ID_Delivery);

  return <Ctx.Provider value={{ ...state, login, registrar, logout, salirCompleto, refresh, recheck, can, feat, cocina, isDelivery }}>{children}</Ctx.Provider>;
}
