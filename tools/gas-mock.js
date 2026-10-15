// Simulador de Google Apps Script para probar backend/*.gs en tu computador (sin Google).
// Uso:  node tools/dev-server.js   (servidor local en http://localhost:8787)
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createRuntime(opts = {}) {
  const sheets = {}; // name -> 2D array
  const props = {};
  const cache = {};
  const files = [];
  const tz = 'America/Santiago';

  function mkRange(sh, r, c, nr, nc) {
    return {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((sh.data[r - 1 + i] || [])[c - 1 + j] ?? ''); o.push(row); } return o; },
      setValues(v) { for (let i = 0; i < nr; i++) { sh.data[r - 1 + i] = sh.data[r - 1 + i] || []; for (let j = 0; j < nc; j++) sh.data[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
      setValue(v) { return this.setValues([[v]]); },
      setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, setNumberFormat() { return this; }
    };
  }
  function mkSheet(name) {
    const sh = { name, data: [] };
    sh.api = {
      getDataRange() { const nr = sh.data.length || 1; const nc = Math.max(1, ...sh.data.map(r => r.length)); return mkRange(sh, 1, 1, nr, nc); },
      getRange(r, c, nr = 1, nc = 1) { return mkRange(sh, r, c, nr, nc); },
      appendRow(row) { sh.data.push(row.slice()); },
      deleteRow(n) { sh.data.splice(n - 1, 1); },
      setFrozenRows() {}, getMaxRows() { return 1000; }, getLastRow() { return sh.data.length; }, getLastColumn() { return Math.max(0, ...sh.data.map(r => r.length)); }
    };
    return sh;
  }
  const ss = {
    getSheetByName(n) { return sheets[n] ? sheets[n].api : null; },
    insertSheet(n) { sheets[n] = mkSheet(n); return sheets[n].api; },
    getSheets() { return Object.values(sheets).map(s => s.api); },
    deleteSheet() {}, getSpreadsheetTimeZone() { return tz; }
  };
  const lockObj = { waitLock() {}, releaseLock() {} };
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const sandbox = {
    console, JSON, Object, Array, Math, Number, String, Date, Error, isNaN, parseInt, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => lockObj },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log: console.log },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      base64Decode: s => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate(d, zone, f) {
        const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
        if (f === 'u') return String({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday]);
        if (f === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
        return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
      }
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 },
      getFoldersByName: () => ({ hasNext: () => true, next: () => ({ createFile: b => { const id = 'FILE' + (files.length + 1); files.push({ id, ...b }); return { getId: () => id, getName: () => b.name, setSharing() {} }; } }) }),
      createFolder: () => ({})
    }
  };
  vm.createContext(sandbox);
  const dir = opts.backendDir || path.join(__dirname, '..', 'backend');
  // const/let de nivel superior no quedan en el sandbox; concatenamos todo en un solo script
  const code = ['Schema.gs', 'Config.gs', 'Code.gs', 'Setup.gs'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const patched = opts.admin ? code.replace("'cambia@tucorreo.com'", `'__x__'`).replace(/const ADMIN_EMAIL = '[^']*'/, `const ADMIN_EMAIL = '${opts.admin.email}'`).replace(/const ADMIN_PASSWORD = '[^']*'/, `const ADMIN_PASSWORD = '${opts.admin.password}'`) : code;
  vm.runInContext(patched + '\n;this.__exports = { doPost, doGet, instalar, readAll_, route_ };', sandbox);
  const ex = sandbox.__exports;
  return {
    sheets, files, install: () => ex.instalar(),
    call(accion, datos, token) {
      const out = ex.doPost({ postData: { contents: JSON.stringify({ accion, datos, token }) } });
      return JSON.parse(out.text);
    },
    readAll: n => ex.readAll_(n)
  };
}
module.exports = { createRuntime };
