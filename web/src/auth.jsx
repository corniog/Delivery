import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { call, getToken, setToken } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null, perms: {}, config: {}, brand: { NOMBRE_NEGOCIO: 'Mi Negocio', LOGO: '' } });

  const applyMe = useCallback((me) => {
    setState({ ready: true, user: me.user, perms: me.perms, config: me.config, brand: { NOMBRE_NEGOCIO: me.config.NOMBRE_NEGOCIO || 'Mi Negocio', LOGO: me.config.LOGO || '' } });
  }, []);

  const loadPublic = useCallback(async () => {
    try {
      const b = await call('publico');
      setState((s) => ({ ...s, ready: true, user: null, brand: b }));
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
    window.addEventListener('auth-expired', onExpire);
    return () => window.removeEventListener('auth-expired', onExpire);
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
  const logout = async () => {
    try { await call('logout'); } catch { /* ignorar */ }
    setToken(null);
    window.location.hash = '#/';
    await loadPublic();
  };
  const refresh = async () => applyMe(await call('me'));
  const can = (mod, act = 'Ver') => !!(state.perms[mod] && state.perms[mod][act]);
  const isDelivery = !!(state.user && state.user.ID_Delivery);

  return <Ctx.Provider value={{ ...state, login, logout, refresh, can, isDelivery }}>{children}</Ctx.Provider>;
}
