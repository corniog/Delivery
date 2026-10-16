// ============================================================
//  SERVIDOR DE LICENCIAS  -  SOLO PARA TI (el proveedor)
//  Va en un Google Sheet PRIVADO tuyo, aparte de los sistemas de tus clientes.
//  Cada cliente tiene una fila: cuando vence o la desactivas, su app se bloquea.
//
//  Pasos:  1) Pega este archivo en Extensiones > Apps Script de ese Sheet privado.
//          2) Ejecuta "instalar" (crea la hoja Licencias).
//          3) Ejecuta "nuevaLicencia" una vez por cliente: te agrega una fila y te muestra su clave.
//          4) Implementar > Nueva implementación > Aplicación web (Ejecutar como: Yo, Acceso: Cualquier persona).
//             Copia la URL /exec: es la LICENCIA_URL que va en el sistema de cada cliente.
// ============================================================
const HOJA = 'Licencias';
const COLUMNAS = ['ID_Licencia', 'Cliente', 'Plan', 'Vencimiento', 'Contacto_WhatsApp', 'Activo', 'Ultima_Consulta', 'Notas'];

function instalar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HOJA);
  if (!sh) sh = ss.insertSheet(HOJA);
  sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
  sh.getRange(1, 5, sh.getMaxRows(), 1).setNumberFormat('@');
  Logger.log('Hoja lista. Ahora ejecuta nuevaLicencia por cada cliente.');
}

// Agrega una fila para un cliente nuevo y muestra su clave (LICENCIA_ID). Completa Cliente, Plan, Vencimiento y WhatsApp en la hoja.
function nuevaLicencia() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  if (!sh) throw new Error('Ejecuta primero "instalar".');
  const clave = 'LIC-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20).toUpperCase();
  sh.appendRow([clave, '', 'MENSUAL', '', '56968005177', true, '', '']);
  Logger.log('Clave nueva: ' + clave + '  (completa Cliente, Plan y Vencimiento en la hoja)');
}

function salida_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function fechaISO_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return 'INVALIDA';
}

// Los sistemas de tus clientes llaman a esta función:  .../exec?k=CLAVE
function doGet(e) {
  const k = String((e && e.parameter && e.parameter.k) || '').trim();
  if (!k) return salida_({ ok: false, error: 'Falta la clave de licencia' });
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  if (!sh) return salida_({ ok: false, error: 'Servidor de licencias sin instalar' });
  const datos = sh.getDataRange().getValues();
  const h = datos[0];
  const col = function (n) { return h.indexOf(n); };
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i];
    if (String(f[col('ID_Licencia')]).trim() !== k) continue;
    sh.getRange(i + 1, col('Ultima_Consulta') + 1).setValue(new Date());
    const act = f[col('Activo')];
    return salida_({
      ok: true,
      plan: String(f[col('Plan')] || ''),
      vencimiento: fechaISO_(f[col('Vencimiento')]),
      whatsapp: String(f[col('Contacto_WhatsApp')] || '').replace(/\D/g, ''),
      activo: !(act === false || String(act).toUpperCase() === 'FALSE')
    });
  }
  return salida_({ ok: false, error: 'Licencia no encontrada' });
}
