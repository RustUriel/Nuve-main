# Nuvé — E-commerce de maquillaje (Astro + GraphQL + PostgreSQL)

Proyecto integrado de PWII: front migrado a **Astro (SSR)**, backend **GraphQL** sobre **PostgreSQL**
y un **sistema de autenticación (AutSystem)** con **JWT, refresh tokens y roles** (admin, operador, cliente).

```
nuve-ecommerce-integrado/
├── back/    # Node + Apollo Server (GraphQL) + PostgreSQL + módulo auth
├── front/   # Astro (SSR, adaptador Node) + islas de React + nanostores
└── docs/    # Casos de prueba para el reporte
```

## Requisitos

- **Node.js 22.12 o superior** (lo exige Astro 7). Verifica con `node --version`; si tienes una versión menor, instala la LTS desde https://nodejs.org
- PostgreSQL 14 o superior
- MongoDB (opcional en local; se usa para la bitácora de eventos). Gratis en MongoDB Atlas.

## Arranque rápido

**1. Base de datos** (PostgreSQL 14+). En Windows, si `psql` no está en el PATH, usa la ruta completa:

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -U postgres -c "CREATE DATABASE nuve_ecommerce"
cd back
& $psql -U postgres -d nuve_ecommerce -f db/schema.sql
& $psql -U postgres -d nuve_ecommerce -f db/seed.sql
# Migraciones, en orden (se pueden repetir sin problema)
Get-ChildItem db/migraciones/*.sql | Sort-Object Name | ForEach-Object { node db/migrar.js $_.FullName }
```

> Si ya tenías la base de la versión anterior, bórrala y vuelve a crearla
> (`DROP DATABASE nuve_ecommerce;` y los tres comandos de arriba): el esquema cambió
> (tabla `refresh_token`, roles nuevos, contraseñas hasheadas).

**2. Backend**

```powershell
cd back
Copy-Item .env.example .env      # edita DATABASE_URL (tu contraseña) y JWT_SECRET
npm install
npm start                         # http://localhost:4000
```

**3. Frontend** (otra terminal)

```powershell
cd front
Copy-Item .env.example .env
npm install
npm run dev                       # http://localhost:5173
```

## Pruebas automatizadas y CI/CD

```powershell
cd back
npm run lint      # análisis de calidad (ESLint)
npm test          # pruebas automatizadas (node --test)
```

Las pruebas de integración con la base de datos corren con `NUVE_PRUEBAS_BD=1` y la prueba de
la bitácora corre si hay `MONGODB_URI`. En GitHub las corre el pipeline:

- `.github/workflows/ci.yml` (en cada push y pull request): backend (ESLint, base de prueba con
  PostgreSQL y MongoDB, pruebas), frontend (`astro check` y build de producción) y MCP (sintaxis).
- `.github/workflows/cd.yml` (cuando CI termina bien en `main`): dispara el despliegue en Render
  (backend) y Netlify (frontend) y comprueba que respondan. Necesita los secretos
  `RENDER_DEPLOY_HOOK_URL` y `NETLIFY_BUILD_HOOK_URL` en GitHub > Settings > Secrets and variables > Actions.

## Prefactura (estructura CFDI)

Al pagar un pedido, el cliente y el personal pueden descargar su prefactura en XML y PDF
(Mi cuenta > Mis pedidos, o Administración > Pedidos). El XML se valida contra el esquema oficial
del SAT (`back/src/facturacion/xsd`). No lleva sello ni timbrado: no tiene validez fiscal.

## Usuarios de prueba (contraseña de todos: `Nuve2026!`)

| Correo | Rol |
|---|---|
| `admin@example.com` | ADMIN |
| `operador@example.com` | OPERADOR |
| `valeria@example.com` | CLIENTE |
| `karla@example.com` | CLIENTE |

Cualquier persona que se registre en `/registro` entra siempre como **CLIENTE**; solo un admin puede crear operadores/admins.

## Roles y permisos

| Acción | Cliente | Operador | Admin |
|---|:-:|:-:|:-:|
| Ver catálogo, carrito, comprar | sí | sí | sí |
| Ver / cancelar (si está pendiente) **sus** pedidos | sí | — | — |
| Ver todos los pedidos y cambiar su estado | no | sí | sí |
| Ajustar inventario | no | sí | sí |
| Crear/eliminar productos, marcas, categorías | no | no | sí |
| Crear usuarios, cambiar roles, activar/desactivar cuentas | no | no | sí |

Pantallas: `/mi-cuenta` (cualquier sesión), `/operador` (operador y admin), `/admin` (solo admin).
Los permisos viven en **un solo archivo**: `back/src/auth/permisos.js`.

## Cómo funciona el auth (resumen para exponer)

1. **Registro / login** → el backend valida, compara la contraseña con **bcrypt** y devuelve dos tokens:
   - **Access token**: JWT firmado (HS256) con el id y el rol. Dura **15 min**.
   - **Refresh token**: cadena aleatoria de 96 caracteres. Dura **7 días**; en la BD solo se guarda su **hash SHA-256**.
2. Astro guarda ambos en **cookies `httpOnly` + `SameSite=Lax`**: JavaScript del navegador nunca los ve (mitiga XSS)
   y no viajan en POST desde otros sitios (mitiga CSRF).
3. **`front/src/middleware.ts`** corre en cada petición: valida el access token; si expiró, usa el refresh token para
   pedir un par nuevo y actualiza las cookies. También protege las rutas por rol (sin sesión → `/login`; sin permiso → 403).
4. **Rotación**: cada refresh token sirve **una sola vez**. Si alguien reutiliza uno ya usado (posible robo) se
   **revocan todas las sesiones** de ese usuario.
5. El navegador **nunca habla directo con el backend**: las páginas y endpoints de Astro llaman al GraphQL en el servidor
   con `Authorization: Bearer <accessToken>`. El backend decide los permisos (Astro solo redirige para mejor UX).

Otras medidas: el precio del pedido lo calcula el backend (no se confía en el cliente), la contraseña nunca se expone
en el schema, mensajes de login genéricos (no revelan si el correo existe), un cliente solo accede a **sus** registros,
`?next=` solo acepta rutas internas, y el stock se descuenta dentro de la transacción del pedido.

Más detalle en `back/README.md` y `front/README.md`. Casos de prueba en `docs/PRUEBAS.md`.
