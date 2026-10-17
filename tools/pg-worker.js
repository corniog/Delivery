// Hilo que aloja el Postgres embebido (PGlite) y responde pedidos síncronos del hilo principal.
const { parentPort, workerData } = require('worker_threads');
const { nuevaBase } = require('./pg-load');
(async () => {
  const db = await nuevaBase(workerData.archivos);
  const { port, sab } = workerData; const flag = new Int32Array(sab);
  const responder = (r) => { port.postMessage(r); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); };
  port.on('message', async (m) => {
    try {
      if (m.t === 'api') {
        const r = await db.query('select api($1, $2::jsonb, $3) as r', [m.accion, JSON.stringify(m.datos || {}), m.token || null]);
        responder({ ok: true, r: r.rows[0].r });
      } else if (m.t === 'sql') {
        const r = await db.query(m.sql, m.params || []);
        responder({ ok: true, r: r.rows });
      } else if (m.t === 'exec') { await db.exec(m.sql); responder({ ok: true, r: null }); }
    } catch (e) { responder({ ok: false, error: String(e.message || e) }); }
  });
  Atomics.store(flag, 0, 1); Atomics.notify(flag, 0);   // listo
})().catch((e) => { console.error(e); process.exit(1); });
