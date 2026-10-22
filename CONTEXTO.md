# CONTEXTO DEL PROYECTO (para continuar en un chat nuevo)

## Quién y qué
- Usuario: habla español (Chile, zona America/Santiago), NO técnico → explicar simple, paso a paso, en español, con botones/rutas exactas.
- Objetivo: app de gestión + delivery para emprendedores, costo cero. Inventario, ventas, clientes, proveedores/compras, delivery con mapa en vivo, historial/KPI, reportes Excel, usuarios/roles/permisos, logo, tickets térmico/A4, lector de código de barras, licencias/planes controlados por el proveedor (el usuario), web PWA + APK Android (Capacitor).
- Repo GitHub: `corniog/Delivery` (rama main). Carpeta de trabajo: `/home/claude/delivery`; frontend React/Vite en `web/`. Push: `git push -q origin HEAD:main`.

## Dos motores (misma app)
1. **Google Sheets + Apps Script**: `backend/Code.gs`; se regenera `backend/TODO_EN_UN_ARCHIVO.gs` con `python3 tools/generar_esquema.py`. Clientes Apps Script deben pegar el archivo nuevo, ejecutar `actualizar`, publicar nueva versión y reingresar LICENCIA_URL/ID.
2. **Supabase (Postgres)**: una RPC `public.api(accion,datos,token)`, multi-negocio (`tenant_id`), tabla `negocios` (plan, vencimiento, activo, funciones_extra, max_usuarios, whatsapp). SQL: `python3 tools/generar_supabase.py` → `supabase/01_esquema.sql`, `TODO_SUPABASE.sql` (+ `02_api.sql` escrito a mano). Se pega `TODO_SUPABASE.sql` en SQL Editor (idempotente) cada vez que cambia. Solo clave *publishable* en la app; NUNCA secret/service_role.
- Proyecto Supabase del usuario: `https://iozezyrckhuxgugjvjrz.supabase.co`.
- Registro propio = 15 días de prueba (plan PRUEBA). Planes: ESENCIAL / PROFESIONAL / PRUEBA / PREMIUM (todas las funciones, usuarios ilimitados).
- **Cuenta dueña**: `supabase/CREAR_DUENO.sql` (crea negocio+usuario, PREMIUM, vencimiento 2035-12-31; comandos para cambiar fecha/plan/suspender al final del archivo). Correo del usuario: exking.guedez.tuv@gmail.com.
- Selección de motor en `web/src/api.js` (config.json con API_URL tiene prioridad sobre variables Supabase; en Cloudflare el build vacía config.json con `{}`).
- La configuración del servidor se oculta a clientes; solo se ve con `?admin=1`.

## Hosting
- Cloudflare Worker con assets estáticos (`wrangler.jsonc`, carpeta `web/dist`). URL actual: `https://sistema-venta-y-delivery.exkingkeng.workers.dev`. Ya desplegado y funcionando.
- Dominio propio del usuario: `atlanthes.cl` (comprado, renovación anual). Plan: `app.atlanthes.cl` (Workers → Settings → Domains & Routes → Add → Custom domain). 
- Imagen al compartir link (OG): `web/public/og.png`; la dirección se toma de la variable de build `VITE_SITE_URL` (por defecto `https://app.atlanthes.cl`).
- HashRouter + `base:'./'` → funciona en cualquier host.

## APK (Capacitor) — `.github/workflows/apk.yml` (Actions → Crear APK)
- Modos: **en vivo** (carga la URL publicada; la que usa el usuario) y empaquetada. Entradas: nombre_app, url_api, url_supabase, clave_supabase, modo, id_app.
- Hay que regenerar la APK solo cuando cambia código nativo o la URL (ej. al pasar al dominio `app.atlanthes.cl`). La APK con impresión directa ESC/POS es nueva → regenerar una vez.
- Nueva entrada **url_web** en el workflow: dirección de la web para el modo en vivo (ej. `https://app.atlanthes.cl`; si se deja vacía usa GitHub Pages, que NO sirve con repo privado). Usar siempre la dirección de Cloudflare.
- Plugins nativos: `NativePrintPlugin` (diálogo de impresión Android) y `EscPosPlugin` (Bluetooth/USB/red directo, `tools/android/*.java.txt`).

## Impresión
- Ticket: `web/src/Ticket.jsx`, `Comanda.jsx`, `ui.jsx` (`imprimir()` aísla `#print-root`, `@page` exacto).
- Impresión directa (APK): `web/src/escpos.js`, `impresoras.js`, `pages/Impresoras.jsx` (Configuración → Impresoras de este dispositivo). Impresoras del usuario: **Epson TM-T20II USB 80 mm con corte** (comprobantes) y **HDFACTORY Bluetooth 58 mm sin cortador** (comandas). Tildes (ESC t 19), corte GS V 66 0, avance ESC J.
- En el navegador no se puede imprimir sin diálogo (alternativas: QZ Tray, Chrome `--kiosk-printing`).
- Ventas con pago pendiente: se imprime solo la comanda; luego "Cobrar y emitir" en Historial (acción `pagarVenta`). Estados: Pendiente / Confirmada.
- Config del negocio: COMANDA_ACTIVA, IMPRESION_AL_VENDER, IMPRESORA_COMANDA/COMPROBANTE (recordatorios), MARGEN_INFERIOR_MM.

## Impresión: estado real (21-oct-2026)
- Probado por el usuario: la app en vivo + APK nueva funcionan «100%». Impresora Bluetooth detectada: **MPT-II** (58 mm, comandas).
- Bug corregido: al «Impresión de prueba» por Bluetooth salía «Need android.permission.BLUETOOTH_SCAN … cancelDiscovery» (Android 12+). Se envuelve `cancelDiscovery()` en try/catch (no se necesita; solo se usan impresoras vinculadas). Requiere **regenerar la APK** (código nativo).

## Dominio (estado)
- Dominio `atlanthes.cl` comprado en **NIC Chile** (no está en Cloudflare). Para usar `app.atlanthes.cl` hay dos caminos: (A) cambiar los servidores de nombres (NS) de NIC Chile a los de Cloudflare (agregar el sitio atlanthes.cl en Cloudflare, plan gratis) y luego Worker → Settings → Domains & Routes → Add → Custom domain; (B) dejar DNS en NIC y crear un CNAME `app` hacia el workers.dev (menos fiable con Workers). Se recomienda A.
- Variable de build opcional `VITE_SITE_URL` (Cloudflare → Worker → Settings → Variables and Secrets / Build) para la imagen OG; por defecto `https://app.atlanthes.cl`. No hace falta tocarla si se usa ese dominio.

## Login / marca
- El nombre del negocio en el login sale del código guardado en el dispositivo (`localStorage negocio` o `?n=codigo`). Botón **«Salir completamente»** (login y menú) olvida el negocio y vuelve a pantalla neutra «App Negocio».

## Historial de cambios recientes (20-oct-2026)
1. Salir completamente (login + menú). 2. Imagen OG (`web/public/og.png`, metas en `web/index.html`, `vite.config.js` plugin og-site). 3. Guía de dominio con NIC Chile. 4. CONTEXTO.md en repo y en el Proyecto (leerlo al iniciar chat nuevo; actualizarlo cuando el usuario diga «actualiza el CONTEXTO»). 5. APK workflow con `url_web`.

## Historial de cambios recientes (22-oct-2026)
1. Pantalla de Inicio: las tarjetas Vender / Inventario / Delivery / Historial se veían en negro y subrayadas sobre fondo azul oscuro (eran enlaces con color de acento). Arreglado en `web/src/styles.css` con la regla `a.card.stat` (usa `var(--ink)` y sin subrayado). Es solo web: NO hace falta regenerar la APK (la app en vivo lo toma al desplegar Cloudflare).

## Pruebas / herramientas
- `tools/test-backend.js`, `test-supabase.js` (PGlite), `test-licencia.js`, `test-escpos.mjs`; dev servers `tools/dev-server.js` (:8787, `DEV_LICENCIA=0`), `vite preview` (:4173). Para parar: `fuser -k 8787/tcp` (no usar pkill: mata la shell).
- Playwright E2E en /tmp (no persiste).

## Pendiente / por probar
- Probar impresión directa real en Epson y HDFACTORY (nunca verificada en hardware).
- Conectar `app.atlanthes.cl` en Cloudflare y regenerar APK en vivo con esa URL.
- Verificar con `CREAR_DUENO.sql` el ingreso como dueño.
- Pendientes tipo Play Store: verificación de correo (Supabase Auth), captcha, cobros/billing, política de privacidad, respaldos.
