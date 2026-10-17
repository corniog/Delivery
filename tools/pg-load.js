// Carga el SQL de Supabase en un Postgres embebido (PGlite) para probarlo sin tu proyecto real.
//   node tools/pg-load.js 01_esquema.sql 02_api.sql      (requiere: npm i @electric-sql/pglite)
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs'), path = require('path');
async function nuevaBase(archivos) {
  const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec('create role anon nologin; create role authenticated nologin;');
  for (const f of archivos) {
    try { await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8')); }
    catch (e) { throw new Error(f + ': ' + e.message); }
  }
  return db;
}
module.exports = { nuevaBase };
if (require.main === module) nuevaBase(process.argv.slice(2)).then(() => console.log('✔ SQL cargado sin errores')).catch((e) => { console.error('✘', e.message); process.exit(1); });
