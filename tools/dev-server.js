// Servidor local que imita tu Apps Script (datos en memoria). Para probar la app sin Google.
// node tools/dev-server.js   ->  http://localhost:8787   (usuario: master@demo.com / Demo12345)
const http = require('http');
const { createRuntime } = require('./gas-mock');
const rt = createRuntime({ admin: { email: 'master@demo.com', password: 'Demo12345' } });
rt.install();
if (process.env.DEV_VENC) rt.sheets.Suscripcion.data.find(r => r[0] === 'Vencimiento')[1] = process.env.DEV_VENC;
if (process.env.DEV_PLAN) rt.sheets.Suscripcion.data.find(r => r[0] === 'Plan')[1] = process.env.DEV_PLAN;
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
