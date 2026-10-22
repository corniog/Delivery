# Manual de permisos (Usuarios → Roles y permisos)

Cada fila es un **módulo** y cada columna una **acción**. Marcar una casilla le da esa acción a la persona. Si un módulo no tiene «Ver», esa persona no entra a esa pantalla.

Las acciones son las mismas con Apps Script y con Supabase.

| Acción | Qué significa en general |
|---|---|
| **Ver** | Entrar a la pantalla y ver la información |
| **Crear** | Agregar registros nuevos |
| **Editar** | Cambiar lo que ya existe |
| **Eliminar** | Borrar o anular |
| **Exportar** | Bajar archivos Excel (solo Reportes) |

## Qué hace cada permiso, módulo por módulo

**Inventario**
- Ver: ve productos y stock (también al vender).
- Crear: agrega productos.
- Editar: cambia datos del producto y ajusta el stock.
- Eliminar: borra productos.

**Categorías** (Ver / Crear / Editar / Eliminar): ver, agregar, cambiar y borrar categorías.

**Ventas**
- Crear: usa la pantalla **Vender** (hacer ventas) y **cobra pedidos que quedaron pendientes** («Cobrar y emitir»).
- Eliminar: **anula** ventas.
- Ver: ve las ventas y su detalle.
- Editar: hoy no tiene efecto en la app.

**Clientes** (Ver / Crear / Editar / Eliminar): ver la lista, agregar, cambiar y borrar clientes (nombre, teléfono, dirección…).

**Proveedores** (Ver / Crear / Editar / Eliminar): ver, agregar, cambiar y borrar proveedores y sus visitas.

**Delivery**
- Ver: entra al módulo Delivery: pedidos, repartidores y **mapa en vivo**.
- Crear: agrega **repartidores** y puede elegir **«Delivery»** como tipo de entrega al vender.
- Editar: cambia los datos de los repartidores y **mueve los pedidos de reparto** (aceptar, salir a entregar, finalizar, rechazar, cancelar).
- Eliminar: borra repartidores.
- Esto es para el personal de **administración/ventas**. Los repartidores se manejan con su propia regla (ver «Usuarios repartidores» más abajo).

**Historial**
- Ver: ve el **historial de ventas y de delivery** (lista, detalle del pedido y reimprimir).
- Editar: **hoy no tiene efecto**. Cobrar un pedido pendiente depende de **Ventas → Crear**, y anular depende de **Ventas → Eliminar**, aunque se haga desde el Historial.

**Base de conocimiento** (Ver / Crear / Editar / Eliminar): leer y administrar los artículos.

**Reportes**: **Exportar** permite bajar los reportes en Excel.

**KPI**: Ver permite ver los indicadores (ventas del día, ticket promedio, etc.).

**Usuarios**
- Ver: ve usuarios y roles.
- Crear: crea usuarios.
- Editar: cambia datos, restablece contraseñas y cambia permisos.

**Configuración**
- Ver: abre la pantalla.
- Editar: guarda cambios (nombre, color, logo, impresión, etc.).

## Usuarios repartidores (usuario ligado a un repartidor)
Un usuario ligado a un repartidor (campo «Delivery» al crearlo) tiene reglas **fijas**, sin importar qué casillas tenga marcadas el rol. El servidor las aplica en Apps Script y en Supabase.

**Puede:**
- Ver **solo sus propios pedidos** y su **propio historial** (solo lectura).
- **Aceptar**, **rechazar**, **salir a entregar**, **finalizar** y **cancelar** sus entregas (al cancelar o rechazar se avisa a la administración).
- Compartir su ubicación mientras entrega y abrir la ruta en Google Maps.
- Cambiar su propia contraseña.

**No puede, nunca:**
- Crear ventas o pedidos, ni elegir «Delivery» como tipo de entrega.
- Crear, editar o borrar repartidores, clientes, productos, usuarios ni nada más.
- Ver pedidos o historial de otros repartidores, las ventas, ni el mapa en vivo de administración.

Por eso, para un rol de repartidor basta con **Delivery → Ver**. Las demás casillas no tienen efecto.

## Ejemplos de combinación
- **Cajero**: Ventas (Ver, Crear), Clientes (Ver, Crear), Inventario (Ver), Historial (Ver). No anula ventas.
- **Encargado de reparto (administración)**: Delivery (Ver, Crear, Editar), Historial (Ver).
- **Repartidor**: solo Delivery (Ver).
- **Supervisor**: lo del cajero + Ventas (Eliminar) para anular, KPI (Ver), Reportes (Exportar).
