// Pruebas de reglas de negocio que no necesitan base de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://sin-bd@localhost:1/pruebas';
process.env.JWT_SECRET ??= 'secreto-solo-para-pruebas';
const { validarTransicion, estadosSiguientes } = await import('../src/pedidos/estados.js');
const { validarProducto } = await import('../src/productos/validacion.js');
const { validarDireccion } = await import('../src/direcciones/validacion.js');
const { nombrePublico } = await import('../src/interaccion/servicio.js');
const tokens = await import('../src/auth/tokens.js');

test('PA-14: transiciones permitidas del pedido', () => {
  assert.deepEqual(estadosSiguientes('PENDIENTE'), ['CANCELADO']);
  assert.deepEqual(estadosSiguientes('PAGADO'), ['ENVIADO', 'CANCELADO']);
  assert.deepEqual(estadosSiguientes('ENVIADO'), ['ENTREGADO']);
  assert.deepEqual(estadosSiguientes('ENTREGADO'), []);
  assert.deepEqual(estadosSiguientes('CANCELADO'), []);
});

test('PA-15: un pedido no pasa a PAGADO a mano', () => {
  assert.throws(() => validarTransicion('PENDIENTE', 'PAGADO'));
});

test('PA-16: ENTREGADO y CANCELADO son finales', () => {
  assert.throws(() => validarTransicion('ENTREGADO', 'ENVIADO'));
  assert.throws(() => validarTransicion('CANCELADO', 'PENDIENTE'));
  assert.doesNotThrow(() => validarTransicion('PAGADO', 'ENVIADO'));
});

const productoBase = () => ({
  nombre: 'Labial de prueba',
  categoriaId: '1',
  marcaId: '1',
  variantes: [{ sku: 'LAB-PRB-001', tono: 'Rojo', codigoHex: '#C0392B', precio: 189, existencias: 10 }],
  imagenes: [{ urlImagen: 'https://ejemplo.com/labial.jpg', principal: true }],
});

test('PA-17: el producto válido se acepta', () => {
  const p = validarProducto(productoBase());
  assert.equal(p.variantes[0].sku, 'LAB-PRB-001');
});

test('PA-18: precio, SKU repetido, color y existencias inválidos se rechazan', () => {
  const sinPrecio = productoBase();
  sinPrecio.variantes[0].precio = 0;
  assert.throws(() => validarProducto(sinPrecio));
  const repetido = productoBase();
  repetido.variantes.push({ ...repetido.variantes[0] });
  assert.throws(() => validarProducto(repetido));
  const color = productoBase();
  color.variantes[0].codigoHex = 'rojo';
  assert.throws(() => validarProducto(color));
  const negativo = productoBase();
  negativo.variantes[0].existencias = -1;
  assert.throws(() => validarProducto(negativo));
});

test('PA-19: el producto necesita al menos una imagen', () => {
  const p = productoBase();
  p.imagenes = [];
  assert.throws(() => validarProducto(p));
});

const direccionBase = () => ({ calle: 'Av. Juárez', numero: '123', colonia: 'Centro', ciudad: 'Guadalajara', estado: 'Jalisco', codigoPostal: '44100' });

test('PA-20: la dirección válida se acepta', () => {
  assert.equal(validarDireccion(direccionBase()).estado, 'Jalisco');
});

test('PA-21: código postal de 5 dígitos y estado de la lista', () => {
  assert.throws(() => validarDireccion({ ...direccionBase(), codigoPostal: '4410' }));
  assert.throws(() => validarDireccion({ ...direccionBase(), estado: 'Texas' }));
});

test('PA-22: el autor de una reseña se muestra como nombre e inicial', () => {
  assert.equal(nombrePublico('Valeria Gomez'), 'Valeria G.');
  assert.equal(nombrePublico('Ana'), 'Ana');
});

test('PA-23: el token de acceso se verifica y uno alterado se rechaza', () => {
  const t = tokens.firmarAccessToken(5, 'CLIENTE');
  assert.deepEqual(tokens.verificarAccessToken(t), { id: '5', rol: 'CLIENTE' });
  assert.equal(tokens.verificarAccessToken(t + 'x'), null);
});

test('PA-24: el ticket de tiempo real no sirve como token de acceso', () => {
  const ticket = tokens.firmarTicketTiempoReal(5, 'CLIENTE');
  assert.equal(tokens.verificarAccessToken(ticket), null);
});

test('PA-25: el token de renovación tiene 96 caracteres y se guarda como hash SHA-256', () => {
  const r = tokens.generarRefreshToken();
  assert.equal(r.length, 96);
  assert.match(tokens.hashToken(r), /^[0-9a-f]{64}$/);
});
