// Pruebas de la prefactura con estructura CFDI (back/src/facturacion).
// No necesitan base de datos: construirXml y validarXml son funciones puras.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://sin-bd@localhost:1/pruebas';
const { construirXml, validarXml, calcularConceptos, formaPago, fechaSat } = await import('../src/facturacion/cfdi.js');
const { generarPdf } = await import('../src/facturacion/pdf.js');

const pedido = { id: 7, fecha: '2026-11-15T18:30:00Z', fecha_pago: '2026-11-15T18:35:00Z', total: '407.00', metodo_pago: 'MERCADO_PAGO', transaccion_pago_id: 'MP-1', oxxo_orden_id: null };
const lineas = [
  { cantidad: 1, precio_unitario: '189.00', sku: 'LAB-ROJ-001', tono: 'Rojo Pasion', producto: 'Labial Mate Pasion' },
  { cantidad: 2, precio_unitario: '109.00', sku: 'DEL-NEG-001', tono: null, producto: 'Delineador' },
];

test('PA-3: el XML de la prefactura pasa la validación contra el XSD del SAT', async () => {
  const { xml } = construirXml({ pedido, lineas });
  const r = await validarXml(xml);
  assert.equal(r.valido, true, r.errores.join('\n'));
});

test('PA-4: un XML alterado no pasa la validación', async () => {
  const { xml } = construirXml({ pedido, lineas });
  const roto = xml.replace('Moneda="MXN"', 'Moneda="PESOS"');
  const r = await validarXml(roto);
  assert.equal(r.valido, false);
  assert.ok(r.errores.length > 0);
});

test('PA-5: el total de la prefactura es igual al total del pedido (base + IVA)', () => {
  const { resumen } = construirXml({ pedido, lineas });
  assert.equal(resumen.total, 407);
  assert.equal(Math.round((resumen.subTotal + resumen.totalIva) * 100) / 100, 407);
});

test('PA-6: cada concepto separa la base y el IVA del 16 %', () => {
  const [c] = calcularConceptos([lineas[0]]);
  assert.equal(c.importeConIva, 189);
  assert.equal(c.base, 162.93);
  assert.equal(c.iva, 26.07);
});

test('PA-7: la forma de pago sigue el catálogo c_FormaPago', () => {
  assert.equal(formaPago({ metodo_pago: 'PAYPAL' }), '06');
  assert.equal(formaPago({ metodo_pago: 'MERCADO_PAGO', oxxo_orden_id: 'X', transaccion_pago_id: 'X' }), '01');
  assert.equal(formaPago({ metodo_pago: 'MERCADO_PAGO', oxxo_orden_id: null, transaccion_pago_id: 'T' }), '04');
});

test('PA-8: la fecha usa el formato del SAT en hora del centro de México', () => {
  assert.equal(fechaSat('2026-11-15T18:35:00Z'), '2026-11-15T12:35:00');
});

test('PA-9: la representación impresa es un PDF', async () => {
  const { resumen } = construirXml({ pedido, lineas });
  const pdf = await generarPdf({ pedido, resumen });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
