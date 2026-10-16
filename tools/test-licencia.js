// Prueba: servidor de licencias (proveedor) + sistema del cliente que se bloquea al vencer
const { createRuntime } = require('./gas-mock');
const assert = require('assert');
const path = require('path');
const dayStr = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(Date.now() + n * 86400000));

// 1) Servidor de licencias del proveedor
const lic = createRuntime({ backendDir: path.join(__dirname, '..', 'licencias'), files: ['Licencias.gs'], exports: ['doGet', 'instalar', 'nuevaLicencia'] });
lic.ex.instalar(); lic.ex.nuevaLicencia();
const fila = () => lic.sheets.Licencias.data[1];
const KEY = fila()[0];
assert(/^LIC-[0-9A-F]{20}$/.test(KEY), 'clave generada');
assert.strictEqual(lic.get({ k: 'x' }).ok, false);
assert.strictEqual(lic.get({}).ok, false);
const set = (plan, venc, activo = true, wa = '56968005177') => { const f = fila(); f[2] = plan; f[3] = venc; f[4] = wa; f[5] = activo; };

// 2) Sistema del cliente conectado a ese servidor
let caido = false;
const cli = createRuntime({
  admin: { email: 'master@test.com', password: 'Clave12345' },
  licencia: { url: 'mock://licencias', id: KEY },
  urlFetch: (url) => {
    if (caido) throw new Error('Address unavailable');
    const k = decodeURIComponent(url.split('k=')[1]);
    const body = JSON.stringify(lic.get({ k }));
    return { getResponseCode: () => 200, getContentText: () => body };
  }
});
cli.install();
const ok = (r) => { if (!r.ok) throw new Error('Esperaba ok: ' + r.error + ' ' + r.code); return r.data; };
const blocked = (r, estado) => { assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'LICENSE'); assert.strictEqual(r.licencia.bloqueada, true); if (estado) assert.strictEqual(r.licencia.estado, estado); return r.licencia; };
const fresco = () => { cli.clearCache(); };           // simula pasar los 5 min de caché
const login = () => ok(cli.call('login', { email: 'master@test.com', password: 'Clave12345' }));

// Activa, sin vencimiento
set('MENSUAL', '');
let T = login().token;
assert.strictEqual(ok(cli.call('suscripcion', {}, T)).estado, 'sin_vencimiento');
assert.strictEqual(ok(cli.call('publico')).licencia.bloqueada, false);

// Activa con 30 días
fresco(); set('ANUAL', dayStr(30));
let s = ok(cli.call('suscripcion', {}, T)); assert.strictEqual(s.estado, 'activo'); assert.strictEqual(s.diasRestantes, 30); assert.strictEqual(s.plan, 'ANUAL'); assert.strictEqual(s.whatsapp, '56968005177');

// Por vencer (fecha escrita como dd-mm-aaaa, como la escribiría una persona)
fresco(); const [y, m, d] = dayStr(5).split('-'); set('MENSUAL', `${d}-${m}-${y}`);
assert.strictEqual(ok(cli.call('suscripcion', {}, T)).estado, 'por_vencer');
// Vence hoy: todavía funciona
fresco(); set('MENSUAL', dayStr(0));
assert.strictEqual(ok(cli.call('suscripcion', {}, T)).diasRestantes, 0);
ok(cli.call('listar', { tabla: 'Productos' }, T));

// VENCIDA: se bloquea TODO (con sesión abierta, login y pantalla pública)
fresco(); set('MENSUAL', dayStr(-1));
let l = blocked(cli.call('listar', { tabla: 'Productos' }, T), 'vencido');
assert.strictEqual(l.whatsapp, '56968005177'); assert(/venció/.test(l.mensaje));
blocked(cli.call('crearVenta', { items: [] }, T));
blocked(cli.call('login', { email: 'master@test.com', password: 'Clave12345' }));
const pub = ok(cli.call('publico')); assert.strictEqual(pub.licencia.bloqueada, true);
assert(!JSON.stringify(pub).includes('Password'), 'no filtra datos');

// Renovación: cambias la fecha y se desbloquea (tras refrescar caché)
set('MENSUAL', dayStr(30));
blocked(cli.call('listar', { tabla: 'Productos' }, T), 'vencido');        // aún en caché (≤5 min)
ok(cli.call('publico', { refrescar: true }));                              // botón "Reintentar"
ok(cli.call('listar', { tabla: 'Productos' }, T));

// Suspensión manual
fresco(); set('MENSUAL', dayStr(30), false);
blocked(cli.call('listar', { tabla: 'Productos' }, T), 'suspendido');
fresco(); set('MENSUAL', dayStr(30), true);
ok(cli.call('listar', { tabla: 'Productos' }, T));

// Servidor de licencias caído: gracia con el último dato bueno
fresco(); caido = true;
ok(cli.call('listar', { tabla: 'Productos' }, T));
// ...pero si en el último dato bueno ya había vencido, sigue bloqueado aunque no haya internet
fresco(); caido = false; set('MENSUAL', dayStr(-2)); ok(cli.call('publico', { refrescar: true }));
fresco(); caido = true; blocked(cli.call('listar', { tabla: 'Productos' }, T), 'vencido');
// Pasadas 72 h sin poder verificar: se bloquea
fresco(); caido = false; set('MENSUAL', dayStr(30)); ok(cli.call('publico', { refrescar: true })); fresco();
const last = JSON.parse(cli.props.lic_last); last.verificado = Date.now() - 73 * 3600 * 1000; cli.props.lic_last = JSON.stringify(last);
caido = true; blocked(cli.call('listar', { tabla: 'Productos' }, T), 'error');

// Licencia borrada/inexistente: bloqueo inmediato
caido = false; fresco(); lic.sheets.Licencias.data.splice(1, 1);
blocked(cli.call('listar', { tabla: 'Productos' }, T), 'error');

// Sin LICENCIA_URL (pruebas propias): nunca se bloquea
const libre = createRuntime({ admin: { email: 'a@test.com', password: 'Clave12345' } }); libre.install();
const tl = ok(libre.call('login', { email: 'a@test.com', password: 'Clave12345' })).token;
assert.strictEqual(ok(libre.call('suscripcion', {}, tl)).estado, 'sin_control');
console.log('✔ Licencias: todas las pruebas pasaron');
