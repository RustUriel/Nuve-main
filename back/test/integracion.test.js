// Pruebas de integración con PostgreSQL (esquema + seed + migraciones).
// Solo corren si NUVE_PRUEBAS_BD=1 (así las corre el pipeline de CI con su base de prueba).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const conBd = process.env.NUVE_PRUEBAS_BD === '1';
const omitir = { skip: !conBd && 'sin base de datos (define NUVE_PRUEBAS_BD=1)' };

let pool;
after(async () => pool?.end());

test('PA-10: el esquema de la API se construye y Usuario no expone la contraseña', omitir, async () => {
  const { makeExecutableSchema } = await import('@graphql-tools/schema');
  const { typeDefs } = await import('../src/schema.js');
  const { resolvers } = await import('../src/resolvers.js');
  const esquema = makeExecutableSchema({ typeDefs, resolvers });
  assert.ok(esquema.getQueryType().getFields().prefactura);
  assert.ok(esquema.getQueryType().getFields().bitacora);
  // La contraseña nunca se expone en la API
  assert.equal(esquema.getType('Usuario').getFields().password, undefined);
  ({ pool } = await import('../src/db.js'));
});

test('PA-11: la prefactura de un pedido pagado del seed es válida y cuadra con el total', omitir, async () => {
  ({ pool } = await import('../src/db.js'));
  const { rows } = await pool.query("SELECT id FROM pedido WHERE estado IN ('PAGADO','ENVIADO','ENTREGADO') ORDER BY id LIMIT 1");
  assert.ok(rows[0], 'el seed debe tener al menos un pedido pagado');
  const { generarPrefactura } = await import('../src/facturacion/cfdi.js');
  const p = await generarPrefactura(rows[0].id);
  assert.equal(p.valida, true, p.errores.join('\n'));
});

test('PA-12: un pedido PENDIENTE no tiene prefactura', omitir, async () => {
  ({ pool } = await import('../src/db.js'));
  const { rows } = await pool.query("SELECT id FROM pedido WHERE estado = 'PENDIENTE' ORDER BY id LIMIT 1");
  if (!rows[0]) return;
  const { generarPrefactura } = await import('../src/facturacion/cfdi.js');
  await assert.rejects(() => generarPrefactura(rows[0].id));
});

test('PA-13: no se permite una categoría con nombre repetido (sin importar acentos)', omitir, async () => {
  ({ pool } = await import('../src/db.js'));
  const { rows } = await pool.query('SELECT nombre FROM categoria ORDER BY id LIMIT 1');
  const { validarCatalogo } = await import('../src/catalogo/validacion.js');
  await assert.rejects(() => validarCatalogo('categoria', { nombre: rows[0].nombre.toUpperCase() }));
});
