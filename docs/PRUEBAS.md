# Casos de prueba manuales (PM-1 a PM-45)

Cada fila es el caso **PM-n** citado en el Documento Final (secciones 3.1, 3.2, 3.4 y 3.5). Las pruebas automatizadas (PA-1 a PA-25) están en `back/test/` y se ejecutan con `npm test`.

Los casos 1 a 24 se ejecutaron contra PostgreSQL real, el backend y el front en producción (`npm run build` + `npm start`). Los casos 25 a 45 se ejecutan sobre el sitio publicado antes de cada entrega.
Usuarios de prueba: contraseña `Nuve2026!` (ver README raíz).

| # | Caso | Resultado esperado | Cómo probarlo |
|---|---|---|---|
| 1 | Ver catálogo sin sesión | Se muestra | Abrir `/` |
| 2 | Registro de cliente nuevo | Sesión iniciada, rol CLIENTE | `/registro` |
| 3 | Correo ya registrado / contraseña < 8 caracteres | Mensaje de error | `/registro` |
| 4 | Login con contraseña incorrecta | "Correo o contraseña incorrectos." (genérico) | `/login` |
| 5 | Login correcto por rol | Admin → `/admin`, operador → `/operador`, cliente → `/` | `/login` |
| 6 | Cookies de sesión | `nuve_access` y `nuve_refresh` con **HttpOnly** | DevTools → Application → Cookies |
| 7 | Entrar a `/mi-cuenta`, `/checkout` sin sesión | Redirige a `/login?next=...` y, al entrar, regresa a esa ruta | Abrir la URL |
| 8 | Cliente entra a `/admin` o `/operador` | 403 "Sin permiso" | Login como valeria, abrir URL |
| 9 | Operador entra a `/admin` | 403; sí puede entrar a `/operador` | Login como operador |
| 10 | Operador intenta eliminar producto (API) | `FORBIDDEN` | Sandbox: `eliminarProducto` con token de operador |
| 11 | Admin cambia rol / desactiva cuenta | Se aplica; no puede cambiarse su propio rol | `/admin` |
| 12 | Cuenta desactivada intenta iniciar sesión | Rechazada; sus refresh tokens se revocan | `/admin` → Desactivar → login |
| 13 | **Access token expirado** | La página sigue funcionando: el middleware lo renueva con el refresh token y actualiza cookies | DevTools: borrar solo la cookie `nuve_access` y recargar `/mi-cuenta` |
| 14 | Refresh token inválido | Se borra la sesión y redirige a `/login` | Cambiar el valor de `nuve_refresh` y recargar |
| 15 | **Reuso de refresh token** (posible robo) | Tras la ventana de 10 s se revocan todas las sesiones del usuario | Sandbox: `refrescarToken` dos veces con el mismo token (esperar 11 s entre ambas) |
| 16 | Logout | Refresh token revocado, cookies y carrito borrados | Botón "Salir" |
| 17 | Cliente A lee el pedido de cliente B | "Ese registro no es tuyo." | Sandbox: `pedido(id)` con token de otro cliente |
| 18 | Cliente manda `usuarioId` ajeno al crear dirección/pedido | Se guarda a nombre del cliente logueado | Sandbox: `crearDireccion(datos:{usuarioId:"1",...})` con token de Karla |
| 19 | Pedido con dirección de otro usuario | Rechazado | `crearPedido` con `direccionId:"1"` como Karla |
| 20 | Pedido con cantidad ≤ 0 o mayor al stock | Rechazado; el stock no cambia | `/api/checkout` o Sandbox |
| 21 | Compra y cancelación | Compra descuenta stock; cancelar (solo PENDIENTE) lo devuelve | `/checkout` → `/mi-cuenta` → Cancelar |
| 22 | Consultar `password` de un usuario | Error de validación: el campo no existe | Sandbox: `{ usuarios { password } }` |
| 23 | POST de formulario desde otro origen | 403 (protección CSRF de Astro + cookies SameSite) | `curl -H "Origin: http://evil.com" -X POST -d "a=b" http://localhost:5173/api/auth/login` |
| 24 | `?next=https://sitio-malo.com` en el login | Se ignora; redirige por rol | `/login?next=https://malo.com` |
| 25 | Cambio de contraseña en el perfil | Con la actual incorrecta o una nueva de menos de 8 caracteres: error y no cambia. Con datos válidos: "Tu contraseña se cambió.", la nueva funciona y la otra sesión abierta se cierra al vencer su acceso. | `/mi-cuenta/perfil` con dos navegadores |
| 26 | Descarga de prefactura | Pedido PAGADO: "Prefactura PDF" y "XML" descargan `prefactura-NUV-{id}`; el PDF dice "Sin validez fiscal". Pedido PENDIENTE: sin botones. En `/admin/pedidos` los enlaces PDF y XML funcionan. | `/mi-cuenta` como valeria; `/admin/pedidos` como admin |
| 27 | Prefactura de un pedido ajeno | "Ese registro no es tuyo." | `/api/pedido/prefactura?id={pedido de otro cliente}` con sesión de karla |
| 28 | Bitácora de eventos | Un login fallido aparece como SESION_FALLIDA; al filtrar por PEDIDO_CREADO solo hay eventos de ese tipo. | Fallar un login, crear un pedido y abrir `/admin/bitacora` |
| 29 | Bitácora solo para admin | El operador recibe "Sin permiso". | `/admin/bitacora` con sesión de operador |
| 30 | Pago con tarjeta aprobado | El pedido pasa a PAGADO con método, transacción y fecha de pago. | `/pago/{id}` con la tarjeta de prueba aprobada del proveedor |
| 31 | Pago con tarjeta rechazado | `/pago/resultado` muestra "rechazado" y el motivo; el pedido sigue PENDIENTE. | Tarjeta de prueba con titular de rechazo |
| 32 | Pago con PayPal | El pedido pasa a PAGADO. | Cuenta personal de prueba de PayPal |
| 33 | Ficha OXXO | Generar la ficha dos veces da la misma referencia; "Simular pago" (admin) y luego "Verificar pago" dejan el pedido en PAGADO. | `/pago/oxxo/{id}` y `/admin/pedidos` |
| 34 | Reseñas | Sin compra del producto: no hay formulario y la API rechaza. Con compra pagada: la reseña se publica; una segunda reseña reemplaza a la primera; calificación 6 se rechaza. | Detalle de un producto comprado por valeria |
| 35 | Favoritos | Agregar y quitar desde el corazón se refleja en `/mi-cuenta/favoritos`, el más reciente primero. | Detalle de producto y `/mi-cuenta/favoritos` |
| 36 | Filtros, búsqueda y orden del catálogo | Cada producto mostrado cumple todos los filtros activos y el orden elegido. | Inicio: combinar tono, marca, precio, existencias y orden |
| 37 | Reportes de ventas | Hoy: gráfica de 24 horas; 7 y 30 días: un punto por día, con días sin ventas en 0; máximo 5 productos más vendidos. | `/admin` cambiando el periodo |
| 38 | Tiempo real | Un pedido nuevo y un cambio de existencias aparecen sin recargar; el cliente ve el cambio de estado de su pedido. | `/operador` y `/mi-cuenta` abiertos en otra ventana |
| 39 | Asesora Nuvé | Hasta 3 recomendaciones con imagen, nombre, tono, marca, precio, motivo y enlace; la pregunta 21 en una hora muestra el tiempo de espera. | Botón de la Asesora con sesión de cliente |
| 40 | Herramientas para asistentes externos (MCP) | `stock_bajo` devuelve variantes con 5 piezas o menos; con cuenta CLIENTE, `cambiar_estado_pedido` responde "Sin permiso". | Claude Desktop con el servidor `mcp/` configurado |
| 41 | Aviso de cookies | Aparece en la primera visita; tras "Entendido" no vuelve a aparecer al recargar. | Ventana privada nueva |
| 42 | Subida de imágenes | Un GIF o un archivo de más de 5 MB se rechaza; un JPG se sube y el campo se llena con su URL. | Formulario de producto en `/admin/productos/nuevo` |
| 43 | Productos relacionados | Como máximo 4, primero de la misma categoría, sin productos agotados ni desactivados. | Detalle de cualquier producto |
| 44 | Selector de moneda | Con USD, cada precio muestra su equivalente aproximado; el cobro sigue en MXN. | Selector del encabezado |
| 45 | Buscador de direcciones | Con 4 o más caracteres aparecen sugerencias solo de México; al elegir una se llenan los campos; al mover el marcador cambian las coordenadas guardadas. | `/checkout` → Nueva dirección |
