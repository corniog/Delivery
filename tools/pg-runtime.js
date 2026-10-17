// Mismo contrato que tools/gas-mock.js (createRuntime -> install / call), pero contra el SQL de Supabase
// ejecutado en un Postgres real embebido (PGlite). Las llamadas son síncronas (hilo aparte + Atomics).
const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');
const path = require('path');

function createRuntime(opts = {}) {
  const sab = new SharedArrayBuffer(4); const flag = new Int32Array(sab);
  const { port1, port2 } = new MessageChannel();
  const w = new Worker(path.join(__dirname, 'pg-worker.js'), { workerData: { archivos: ['01_esquema.sql', '02_api.sql'], port: port2, sab }, transferList: [port2] });
  w.unref();
  const esperar = () => { Atomics.wait(flag, 0, 0, 120000); };
  Atomics.store(flag, 0, 0); esperar();        // espera a que cargue el SQL
  const pedir = (msg) => {
    Atomics.store(flag, 0, 0); port1.postMessage(msg); esperar();
    const m = receiveMessageOnPort(port1);
    if (!m) throw new Error('Sin respuesta de la base de datos');
    if (!m.message.ok) throw new Error(m.message.error);
    return m.message.r;
  };
  pedir({ t: 'exec', sql: "select set_config('app.debug', 'on', false)" });
  const codigo = { v: null };
  const rt = {
    // Crea un negocio nuevo con su Master (equivale a instalar())
    install() {
      const a = opts.admin || { email: 'master@test.com', password: 'Clave12345' };
      const r = pedir({ t: 'api', accion: 'registrar', datos: { negocio: 'Mi Negocio', nombre: 'Administrador', email: a.email, password: a.password } });
      if (!r.ok) throw new Error('registrar: ' + r.error);
      codigo.v = r.data.codigo;
    },
    call(accion, datos, token) {
      if (accion === 'publico' && codigo.v) datos = Object.assign({ negocio: codigo.v }, datos || {});
      if (accion === 'subirArchivo' && datos && datos.base64) datos = Object.assign({}, datos, { tamano: Math.ceil(datos.base64.length * 0.75) });
      return pedir({ t: 'api', accion, datos: datos || {}, token });
    },
    sql(sql, params) { return pedir({ t: 'sql', sql, params }); },
    readAll(tabla) { return pedir({ t: 'sql', sql: `select * from "${tabla}"` }); },
    exec(sql) { return pedir({ t: 'exec', sql }); },
    close() { w.terminate(); }
  };
  return rt;
}
module.exports = { createRuntime };
