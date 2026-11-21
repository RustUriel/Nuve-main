// Pruebas de la bitácora en MongoDB.
// Sin MONGODB_URI se prueba que la tienda sigue funcionando (el evento se omite).
// Con MONGODB_URI (en el pipeline de CI hay un servicio de MongoDB) se prueba que se guarda y se consulta.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const { registrarEvento, consultarEventos, cerrarBitacora, bitacoraConfigurada } = await import('../src/bitacora/servicio.js');

after(() => cerrarBitacora());

test('PA-1: sin MongoDB configurado, registrar un evento no lanza error', { skip: bitacoraConfigurada() }, async () => {
  assert.equal(await registrarEvento('PEDIDO_CREADO', { pedidoId: 1 }), false);
  assert.deepEqual(await consultarEventos(), { disponible: false, eventos: [] });
});

test('PA-2: con MongoDB, el evento se guarda y aparece primero en la consulta', { skip: !bitacoraConfigurada() }, async () => {
  const marca = `prueba-${Date.now()}`;
  assert.equal(await registrarEvento('PEDIDO_CREADO', { usuarioId: 1, pedidoId: 99, datos: { marca } }), true);
  const r = await consultarEventos({ tipo: 'PEDIDO_CREADO', limite: 5 });
  assert.equal(r.disponible, true);
  assert.equal(JSON.parse(r.eventos[0].datos).marca, marca);
  assert.equal(r.eventos[0].pedidoId, '99');
});
