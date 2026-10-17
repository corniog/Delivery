// Imita la API de Supabase (POST /rest/v1/rpc/api) usando el SQL real en un Postgres embebido.
//   node tools/dev-server-supabase.js     ->  http://localhost:8788   (clave pública de prueba: "clave-de-prueba")
const http = require('http');
const { createRuntime } = require('./pg-runtime');
const rt = createRuntime();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      if (req.headers.apikey !== 'clave-de-prueba') { res.writeHead(401, CORS); return res.end(JSON.stringify({ message: 'Invalid API key' })); }
      if (req.url.startsWith('/rest/v1/rpc/api')) {
        const r = JSON.parse(body || '{}');
        res.writeHead(200, CORS); return res.end(JSON.stringify(rt.call(r.accion, r.datos, r.token)));
      }
      if (req.url.startsWith('/storage/v1/object/')) { res.writeHead(200, CORS); return res.end(JSON.stringify({ Key: 'ok' })); }
      res.writeHead(404, CORS); res.end('{}');
    } catch (e) { res.writeHead(500, CORS); res.end(JSON.stringify({ message: String(e) })); }
  });
}).listen(8788, () => console.log('API Supabase de prueba en http://localhost:8788'));
