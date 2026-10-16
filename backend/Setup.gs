// ============================================================
//  INSTALACIÓN: crea todas las hojas, datos base y el usuario Master.
//  Pasos: 1) edita ADMIN_EMAIL y ADMIN_PASSWORD en Config.gs
//         2) en el editor elige la función "instalar" y presiona Ejecutar
//  Es seguro ejecutarla de nuevo: no borra datos existentes.
// ============================================================
function instalar() {
  if (ADMIN_EMAIL === 'cambia@tucorreo.com') throw new Error('Edita ADMIN_EMAIL y ADMIN_PASSWORD en Config.gs antes de instalar.');
  checkPassword_(ADMIN_PASSWORD);
  crearHojas_();
  // Usuario Master
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const ya = readAll_('Usuarios').some(function (u) { return String(u.Email).toLowerCase() === email; });
  if (!ya) {
    const salt = Utilities.getUuid();
    insert_('Usuarios', {
      ID_Usuario: 'U0001', Email: email, Nombre: 'Administrador', Telefono: '', ID_Rol: MASTER_ROLE, ID_Delivery: '',
      Activo: true, Password_Hash: hash_(ADMIN_PASSWORD, salt), Salt: salt, Ultimo_Login: '', Fecha_Creacion: fmtDT_(new Date())
    });
  }
  Logger.log('Instalación lista. Ahora publica: Implementar > Nueva implementación > Aplicación web.');
}

// Úsala después de PEGAR UNA VERSIÓN NUEVA del código: crea las hojas/datos que falten sin tocar nada existente
// (no necesitas cambiar ADMIN_EMAIL ni ADMIN_PASSWORD).
function actualizar() {
  crearHojas_();
  Logger.log('Estructura al día. Ahora: Implementar > Administrar implementaciones > ✏ > Versión: Nueva versión.');
}

function crearHojas_() {
  const ss = ss_();
  const textCols = /^(ID_|Codigo_Barras$|SKU$|Documento$|Telefono$|Folio$|Unidad$|Abreviatura$|Clave$)/;
  Object.keys(SCHEMA).forEach(function (name) {
    try {
      let sh = ss.getSheetByName(name);
      const h = SCHEMA[name];
      if (!sh) sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
      h.forEach(function (c, i) {
        if (textCols.test(c)) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
    } catch (e) {
      throw new Error('No se pudo preparar la hoja "' + name + '": ' + e.message + ' (revisa que no esté protegida y que tu cuenta sea editora del Sheet)');
    }
  });
  // Quitar la hoja vacía por defecto
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1 && s.getLastRow() <= 1 && s.getLastColumn() <= 1) ss.deleteSheet(s);
  });
  // Datos base
  Object.keys(SEED).forEach(function (name) {
    const key = SCHEMA[name][0];
    const existentes = {};
    readAll_(name).forEach(function (r) { existentes[String(r[key])] = true; });
    SEED[name].forEach(function (row) {
      if (existentes[String(row[0])]) return;
      const o = {};
      SCHEMA[name].forEach(function (c, i) { o[c] = row[i]; });
      insert_(name, o);
    });
  });
  driveFolder_();
}
