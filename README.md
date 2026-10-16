# App Negocio — Inventario, Ventas y Delivery

App web instalable (PWA, funciona en celular y computador) para administrar un negocio:
inventario, ventas con ticket/boleta/factura interna, clientes, proveedores, delivery con
perfil de repartidor, historial con filtros y totales, KPI, reportes en Excel, base de
conocimiento (PDF), usuarios con permisos configurables y **logo personalizable**.

**Costo: $0.** Usa Google Sheets (base de datos) + Apps Script (servidor) + GitHub Pages (web).

```
backend/   Código de Google Apps Script (la API). Se pega en tu Google Sheet.
web/       La aplicación (React + Vite). Se publica sola en GitHub Pages.
tools/     Simulador local y pruebas automáticas del backend.
docs/      Plantilla de la base de datos (referencia).
```

## Puesta en marcha (≈ 15 minutos, una sola vez)

### Parte 1 — El servidor (tu Google Sheet)
1. Entra a [sheets.new](https://sheets.new) y ponle de nombre, por ejemplo, **Base Negocio**.
2. Menú **Extensiones → Apps Script**.
3. Vas a pegar **un solo archivo**. En GitHub abre `backend/TODO_EN_UN_ARCHIVO.gs` y presiona el ícono
   **Copy raw file** (dos cuadritos, arriba a la derecha del código). Vuelve a Apps Script, haz clic dentro del
   editor, **borra todo** lo que haya en `Código.gs` (Ctrl+A, Supr) y **pega** (Ctrl+V). Guarda con el ícono 💾.
   *(Los otros archivos de `backend/` son los mismos trozos por separado; no hace falta usarlos.)*
4. Al principio del código pegado, cambia **ADMIN_EMAIL** (tu correo) y **ADMIN_PASSWORD** (una clave de 8+ caracteres).
5. Arriba, en el selector de funciones elige **instalar** y presiona **Ejecutar**.
   Google pedirá permisos (Sheets y Drive): *Revisar permisos → tu cuenta → Avanzado → Ir a… → Permitir*.
   Esto crea todas las hojas, los roles, los permisos base y tu usuario Master.
6. **Implementar → Nueva implementación → ⚙ Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - Presiona **Implementar** y **copia la URL** que termina en `/exec`.

   > "Cualquier persona" solo permite llegar a la API: sin usuario y contraseña no se puede leer ni escribir nada.
7. **Cuando haya una versión nueva del código** (actualizaciones):
   1. Copia de nuevo `backend/TODO_EN_UN_ARCHIVO.gs` y pégalo en Apps Script reemplazando todo lo anterior.
   2. Elige la función **actualizar** (no `instalar`) y presiona **Ejecutar**. Crea solo lo que falte y no toca tus datos;
      **no necesitas volver a poner tu correo ni tu clave**.
   3. **Implementar → Administrar implementaciones → ✏ (editar) → Versión: Nueva versión → Implementar.**
      La URL se mantiene igual.

### Parte 2 — La web (GitHub Pages)
1. En este repositorio: **Settings → Pages → Source: GitHub Actions**.
   (GitHub Pages gratis requiere repositorio **público**; el código no contiene claves ni datos.)
2. Edita el archivo `web/public/config.json` (lápiz ✏ en GitHub) y pega la URL del paso 6 en `API_URL`.
   Así la app sale ya conectada. (Alternativa: pegarla en el login → **Configurar servidor**.)
3. Sube cambios a `main` (o **Actions → Publicar web → Run workflow**). En ~1 minuto tendrás el link:
   `https://corniog.github.io/Delivery/`

### Parte 3 — Usarla
1. Abre el link, inicia sesión con tu correo y clave de `Config`.
2. **Configuración** → sube tu **logo** y elige tu color. Se ve en el login, menú y tickets de todos los perfiles.
3. **Usuarios y permisos** → crea tu equipo (Ventas, Delivery) y ajusta qué puede hacer cada rol o cada persona.
4. **Categorías** (con imagen) → **Inventario** → ya puedes **Vender**.
5. **Celular:** abre el link en Chrome → menú ⋮ → **Instalar aplicación** (iPhone: Compartir → Añadir a pantalla de inicio).

## Suscripción y bloqueo (control del proveedor)
El control vive en **un Sheet aparte, privado, solo tuyo** (el proveedor). La app de cada cliente consulta ese Sheet; si la suscripción
venció o la suspendes, **toda la app se bloquea** y muestra un botón **Contactar por WhatsApp** (56968005177).

### Configurar el servidor de licencias (una sola vez)
1. Crea un Google Sheet nuevo, privado (nómbralo "Licencias"). **Extensiones → Apps Script**.
2. Pega el contenido de `licencias/Licencias.gs`. Ejecuta `instalar` (autoriza) y luego `nuevaLicencia` (una vez por cada cliente).
3. En la hoja **Licencias** aparece una fila con la clave `LIC-...`. Completa **Plan**, **Vencimiento** (dd-mm-aaaa) y **Activo**.
4. **Implementar → Nueva implementación → Aplicación web**: Ejecutar como **Yo**, acceso **Cualquier persona**. Copia la URL `/exec`.

### Conectar a un cliente
1. Instala el backend del cliente **en tu cuenta de Google** (o ajústalo tú) y en `Config.gs` pon `LICENCIA_URL` (URL del paso 4) y `LICENCIA_ID` (la clave `LIC-...`).
2. Implementar → Administrar implementaciones → editar → **Nueva versión**.
3. No compartas ese Sheet/Apps Script con permiso de edición: quien puede editar puede quitar la verificación.

### Cómo operas
| Quieres | Haces |
|---|---|
| Bloquear por vencimiento | Nada: al pasar la fecha de **Vencimiento** se bloquea sola |
| Bloquear ya | **Activo = FALSE** |
| Renovar | Cambia **Vencimiento** (se aplica en ≤5 min o al pulsar "Ya renové, reintentar") |
| Sin vencimiento | Deja **Vencimiento** vacío |

Si tu servidor de licencias no responde, la app sigue funcionando hasta 72 h con el último estado válido. Si `LICENCIA_URL` queda vacío, no hay control.
El Master del cliente ve en **Configuración → Mi suscripción** el plan y los días restantes; en **Inicio** aparece un aviso cuando faltan 7 días o menos.

## Perfiles incluidos
| Rol | Puede |
|---|---|
| **Master** | Todo. Siempre. |
| **Ventas** | Vender, crear/editar productos y clientes, asignar delivery. No elimina nada. |
| **Delivery** | Solo ve sus pedidos asignados: acepta, rechaza, marca "salí a entregar" y finaliza. Ve su historial. |

El Master puede crear más roles y cambiar cualquier permiso (ver, crear, editar, eliminar, exportar por módulo),
y dar excepciones a una persona puntual (ej.: un vendedor que sí pueda anular ventas).

## Cómo funciona lo importante
- **Venta → stock:** al confirmar, el servidor descuenta el stock, registra el movimiento y, si llega al
  mínimo, crea una alerta (se ve en Inicio para Master y Ventas). Ventas simultáneas están protegidas con bloqueo.
- **Delivery:** la venta con entrega crea un servicio (fecha automática, dirección, km, monto). Al finalizar
  el repartidor, se alerta a Master y Ventas. El botón de ruta abre Google Maps con kilómetros y tiempo (gratis).
- **Historial:** filtra por nombre y rango de fechas; muestra el monto de cada servicio y **el total del filtro**.
- **Tickets:** térmica 58 mm, 80 mm o A4 con el diálogo de impresión del navegador.
  Boleta/factura son **comprobantes internos**; la validez tributaria requiere un proveedor autorizado (ver Pendientes).
- **Código de barras:** botón de escáner con la cámara (Chrome en Android). En iPhone se escribe el código a mano.

## Probar sin Google (en tu computador)
```bash
node tools/test-backend.js          # pruebas automáticas del backend
node tools/dev-server.js            # API simulada en http://localhost:8787  (master@demo.com / Demo12345)
cd web && npm install && npm run dev
```
En el login pulsa **Configurar servidor** y usa `http://localhost:8787`.

## Pendientes (siguientes fases)
- **APK Android** (Capacitor, compilado con GitHub Actions; gratis para uso propio, Google Play cuesta US$25 único).
- **Mapa en vivo** con la ubicación del repartidor (OpenStreetMap, gratis; la base ya tiene la tabla `Ubicaciones_Delivery`).
- **Compras a proveedores** con entrada automática de stock y registro de visitas.
- **Boleta/factura electrónica legal** (requiere proveedor con API; suele tener costo por documento).
- **Migración a servidor propio** (Supabase/PostgreSQL): solo cambia `web/src/api.js`.
- Regenerar el esquema de hojas: `python3 tools/generar_esquema.py`.

## Seguridad
- Las contraseñas se guardan con sal + hash SHA-256 (200 vueltas); nunca en claro.
- Los permisos se validan **en el servidor**, no solo ocultando botones.
- 5 intentos fallidos bloquean el acceso 10 minutos. Las sesiones duran 6 horas.
- Las imágenes y PDF subidos quedan en una carpeta de tu Drive con acceso "cualquiera con el enlace" (necesario para mostrarlas en la app).
