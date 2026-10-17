# Versión Supabase (varios negocios en una sola base de datos)

La misma app (web, PWA y APK) puede usar **dos motores**: Google Sheets + Apps Script (cada negocio con su propio Sheet, como hasta ahora) o **Supabase** (un solo proyecto con todos los negocios, registro propio y 15 días de prueba). La app elige sola: si hay URL y clave de Supabase usa Supabase; si no, Apps Script.

## Puesta en marcha (una sola vez)
1. Crea un proyecto en https://supabase.com (región cercana, por ejemplo *São Paulo*). Guarda la contraseña de la base.
2. Abre **SQL Editor → New query**, pega **todo** `supabase/TODO_SUPABASE.sql` y pulsa **Run**. Es seguro repetirlo: no borra datos.
3. En **Project Settings → API** copia la **Project URL** y la clave **publishable** (`sb_publishable_…`) o, si tu proyecto aún usa la antigua, la **anon**. Nunca uses la clave `secret` / `service_role` en la app.
4. **Probar:** abre la web, en la pantalla de acceso pulsa *Configurar servidor*, pega la URL y la clave de Supabase en el segundo formulario y guarda. Solo cambia ese navegador/dispositivo; tus negocios de Apps Script no se tocan.
   **Dejarlo fijo en un sitio** (solo para un sitio o APK que sea 100 % Supabase): variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY` en GitHub (*Settings → Secrets and variables → Actions → Variables*). Si el sitio ya tiene una URL de Apps Script en `config.json`, esa tiene prioridad y las variables se ignoran.
5. Entra a la app, pulsa **Crear mi negocio** y listo: 15 días con todas las funciones.

> Si en tu proyecto la API de datos (Data API / PostgREST) está desactivada, actívala en *Project Settings → API*.

## Cómo manejas a tus clientes (tú, el proveedor)
En **Table Editor → `negocios`** hay una fila por negocio. Solo tú puedes verla.

| Columna | Qué hace |
|---|---|
| `plan` | `PRUEBA` (al registrarse), `ESENCIAL`, `PROFESIONAL`, `PREMIUM`. Define funciones y límite de usuarios. |
| `vencimiento` | Fecha hasta la que está pagado. Al pasar, la app se bloquea (incluido el login). Vacío = sin vencimiento. |
| `activo` | `false` suspende al instante. |
| `funciones_extra` | Ajuste puntual: `+delivery,+mapa` agrega, `-kpi` quita. |
| `max_usuarios` | Pisa el límite del plan (0 = ilimitados, vacío = el del plan). |
| `whatsapp` | Número que ve el cliente en la pantalla de bloqueo. |

Para renovar a un cliente: cambia `plan` y suma tiempo a `vencimiento`. Nada más.

## Qué hay de distinto frente a la versión Apps Script
- Cada negocio está aislado: cada fila de cada tabla lleva su `tenant_id` y todas las consultas filtran por él. Las tablas no se pueden leer desde internet; solo existe la función `api()`.
- Contraseñas con bcrypt; sesiones de 12 horas guardadas como hash; 5 intentos fallidos = bloqueo de 10 minutos; máximo 5 negocios nuevos por hora desde una misma IP.
- Las imágenes y PDF se suben a Supabase Storage (bucket público `archivos`) con un permiso de un solo uso que reserva la app tras validar sesión y permisos.
- El correo es único en todo el sistema (una cuenta = un negocio).

## Pendiente antes de publicar en Play Store
- **Verificación de correo y recuperar contraseña**: hoy el Master de un negocio puede restablecer claves de su equipo, pero quien olvida la suya como dueño no tiene cómo recuperarla. Lo normal es pasar al login de *Supabase Auth* (correo de confirmación, recuperación, Google).
- Un captcha en el registro (Cloudflare Turnstile / hCaptcha) además del freno por IP.
- Cobro automático (hoy renuevas tú a mano en `vencimiento`).
- Idiomas es/en, política de privacidad y borrado de cuenta (requisitos de Google Play).
- Respaldos: el plan gratuito de Supabase no incluye respaldos automáticos descargables; revisa el plan vigente en su sitio antes de ofrecer respaldos a clientes.

## Probar el SQL sin tener Supabase
```
npm install
npm run test:supabase                      # registro, aislamiento entre negocios, planes, vencimiento y seguridad
BACKEND=pg node tools/test-backend.js      # la misma batería de la versión Apps Script, contra el SQL
node tools/dev-server-supabase.js          # API de prueba en http://localhost:8788 (clave: clave-de-prueba)
```
Se ejecutan en un Postgres real embebido (PGlite). No sustituye probar con tu proyecto: lo primero que debes revisar tras el paso 2 es que el registro y una venta funcionen.

## Regenerar
`python3 tools/generar_esquema.py` (esquema) y `python3 tools/generar_supabase.py` (SQL). Si cambias columnas, vuelve a pegar `TODO_SUPABASE.sql`: crea lo que falta sin tocar los datos (las columnas nuevas de tablas existentes hay que agregarlas con `alter table`).
