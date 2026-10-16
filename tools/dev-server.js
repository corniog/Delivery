// Servidor local que imita tu Apps Script (datos en memoria). Para probar la app sin Google.
// node tools/dev-server.js   ->  http://localhost:8787   (usuario: master@demo.com / Demo12345)
const http = require('http');
const { createRuntime } = require('./gas-mock');
const path = require('path');
// Servidor de licencias simulado (tu Sheet privado). DEV_VENC=dd-mm-aaaa  DEV_PLAN=MENSUAL  DEV_ACTIVO=false
const lic = createRuntime({ backendDir: path.join(__dirname, '..', 'licencias'), files: ['Licencias.gs'], exports: ['doGet', 'instalar', 'nuevaLicencia'] });
lic.ex.instalar(); lic.ex.nuevaLicencia();
const fila = lic.sheets.Licencias.data[1];
const KEY = fila[0];
fila[2] = process.env.DEV_PLAN || 'MENSUAL'; fila[3] = process.env.DEV_VENC || ''; fila[5] = process.env.DEV_ACTIVO !== 'false';
global.__lic = { fila };
const rt = createRuntime({
  admin: { email: 'master@demo.com', password: 'Demo12345' },
  licencia: process.env.DEV_LICENCIA === '0' ? undefined : { url: 'mock://licencias', id: KEY },
  urlFetch: (url) => { const body = JSON.stringify(lic.get({ k: decodeURIComponent(url.split('k=')[1]) })); return { getResponseCode: () => 200, getContentText: () => body }; }
});
rt.install();
const log = console.log; console.log = () => {};
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    try { const r = JSON.parse(body || '{}'); res.writeHead(200, cors); res.end(JSON.stringify(rt.call(r.accion, r.datos, r.token))); }
    catch (e) { res.writeHead(500, cors); res.end(JSON.stringify({ ok: false, error: String(e) })); }
  });
}).listen(8787, () => log('API de prueba en http://localhost:8787  (master@demo.com / Demo12345)'));
