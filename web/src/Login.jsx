import { useState } from 'react';
import { useAuth } from './auth.jsx';
import { getApiUrl, setApiUrl, esSupabase, getSupabase, setSupabase } from './api.js';

export default function Login() {
  const { login, registrar, brand } = useAuth();
  const sb = esSupabase();
  const [modo, setModo] = useState('entrar');
  const [r, setR] = useState({ negocio: '', nombre: '', email: '', password: '' });
  const [sbf, setSbf] = useState({ url: (getSupabase() || {}).url || '', key: (getSupabase() || {}).key || '' });
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoBad, setLogoBad] = useState(false);
  const [cfg, setCfg] = useState(!getApiUrl() && !sb);
  const [url, setUrl] = useState(getApiUrl());
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(f.email, f.password); } catch (x) { setErr(x.message); setBusy(false); }
  };
  const alta = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await registrar({ ...r, zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone }); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="login">
      <div className="card stack">
        {brand.LOGO && !logoBad ? <img className="logo" src={brand.LOGO} alt="" onError={() => setLogoBad(true)} /> : null}
        <h1 style={{ textAlign: 'center' }}>{brand.NOMBRE_NEGOCIO}</h1>
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}>Inicia sesión para continuar</p>
        {modo === 'crear' ? (
          <form className="stack" onSubmit={alta}>
            <p className="muted" style={{ textAlign: 'center', margin: 0 }}>Crea tu negocio: 15 días de prueba con todas las funciones</p>
            <label className="f">Nombre de tu negocio<input className="input" required value={r.negocio} onChange={(e) => setR({ ...r, negocio: e.target.value })} /></label>
            <label className="f">Tu nombre<input className="input" required autoComplete="name" value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} /></label>
            <label className="f">Correo<input className="input" type="email" required autoComplete="username" value={r.email} onChange={(e) => setR({ ...r, email: e.target.value })} /></label>
            <label className="f">Contraseña (mín. 8 caracteres)<input className="input" type="password" required minLength={8} autoComplete="new-password" value={r.password} onChange={(e) => setR({ ...r, password: e.target.value })} /></label>
            {err && <div className="alert">{err}</div>}
            <button className="btn primary" disabled={busy}>{busy ? 'Creando…' : 'Crear mi negocio'}</button>
            <button type="button" className="btn sm" onClick={() => { setModo('entrar'); setErr(''); }}>Ya tengo cuenta</button>
          </form>
        ) : (
        <form className="stack" onSubmit={go}>
          <label className="f">Correo<input className="input" type="email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="f">Contraseña<input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          {err && <div className="alert">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          {sb && <button type="button" className="btn sm" onClick={() => { setModo('crear'); setErr(''); }}>Crear mi negocio (15 días gratis)</button>}
        </form>)}
        <button className="btn sm" onClick={() => setCfg(!cfg)}>Configurar servidor</button>
        {cfg && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setSupabase(sbf.url, sbf.key); window.location.reload(); }}>
            <label className="f">URL de Supabase<input className="input" value={sbf.url} onChange={(e) => setSbf({ ...sbf, url: e.target.value })} placeholder="https://xxxx.supabase.co" /></label>
            <label className="f">Clave pública (anon / publishable)<input className="input" value={sbf.key} onChange={(e) => setSbf({ ...sbf, key: e.target.value })} /></label>
            <button className="btn">Guardar</button>
          </form>)}
        {cfg && !sb && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setApiUrl(url); setSupabase('', ''); window.location.reload(); }}>
            <label className="f">URL del servidor (Apps Script)<input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></label>
            <button className="btn">Guardar URL</button>
          </form>)}
      </div>
    </div>
  );
}
