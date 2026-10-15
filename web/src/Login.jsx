import { useState } from 'react';
import { useAuth } from './auth.jsx';
import { getApiUrl, setApiUrl } from './api.js';

export default function Login() {
  const { login, brand } = useAuth();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoBad, setLogoBad] = useState(false);
  const [cfg, setCfg] = useState(!getApiUrl());
  const [url, setUrl] = useState(getApiUrl());
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(f.email, f.password); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="login">
      <div className="card stack">
        {brand.LOGO && !logoBad ? <img className="logo" src={brand.LOGO} alt="" onError={() => setLogoBad(true)} /> : null}
        <h1 style={{ textAlign: 'center' }}>{brand.NOMBRE_NEGOCIO}</h1>
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}>Inicia sesión para continuar</p>
        <form className="stack" onSubmit={go}>
          <label className="f">Correo<input className="input" type="email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="f">Contraseña<input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          {err && <div className="alert">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <button className="btn sm" onClick={() => setCfg(!cfg)}>Configurar servidor</button>
        {cfg && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setApiUrl(url); window.location.reload(); }}>
            <label className="f">URL del servidor (Apps Script)<input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></label>
            <button className="btn">Guardar URL</button>
          </form>)}
      </div>
    </div>
  );
}
