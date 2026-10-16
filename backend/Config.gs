// ============================================================
//  CONFIGURACIÓN INICIAL  (edita estos 2 valores ANTES de ejecutar instalar())
// ============================================================
const ADMIN_EMAIL = 'cambia@tucorreo.com';       // correo con el que entrarás como Master
const ADMIN_PASSWORD = 'CambiaEstaClave123';     // contraseña inicial (cámbiala dentro de la app)

// ------------------------------------------------------------
//  LICENCIA (control de suscripción). Los pone el proveedor; ver licencias/Licencias.gs
//  Si LICENCIA_URL queda vacío, la app NO se bloquea nunca (solo para pruebas propias).
const LICENCIA_URL = '';   // URL /exec del servidor de licencias
const LICENCIA_ID = '';    // clave de este cliente (hoja Licencias)

// ------------------------------------------------------------
const SESSION_SECONDS = 21600;          // 6 horas (máximo que permite CacheService)
const DRIVE_FOLDER_NAME = 'AppNegocio_Archivos';
const MASTER_ROLE = 'R01';
const MODULES = ['Inventario', 'Categorias', 'Ventas', 'Clientes', 'Proveedores', 'Delivery',
  'Historial', 'Conocimiento', 'Reportes', 'KPI', 'Usuarios', 'Configuracion'];
const ACTIONS_LIST = ['Ver', 'Crear', 'Editar', 'Eliminar', 'Exportar'];
