// back/src/facturacion/pdf.js
// Representación impresa (PDF) de la prefactura. Muestra los mismos datos del XML
// y la leyenda de que no tiene validez fiscal (no está timbrada).

import PDFDocument from 'pdfkit';

const dinero = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CIRUELA = '#6E3B4C';
const GRIS = '#6B5F58';

/** Devuelve el PDF como Buffer. */
export function generarPdf({ pedido, resumen }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const e = resumen.emisor;
    doc.fillColor(CIRUELA).fontSize(22).text('Nuvé', { continued: true }).fontSize(12).fillColor(GRIS).text('  Belleza que te ilumina');
    doc.moveDown(0.5);
    doc.fillColor('#2B2320').fontSize(16).text(`Prefactura NUV-${pedido.id}`);
    doc.fontSize(9).fillColor('#B1473D').text('Sin validez fiscal: documento no timbrado. Estructura CFDI 4.0 del SAT.');
    doc.moveDown();

    doc.fillColor('#2B2320').fontSize(10);
    doc.text(`Emisor: ${e.nombre}   RFC: ${e.rfc}   Régimen fiscal: ${e.regimenFiscal}`);
    doc.text('Receptor: PUBLICO EN GENERAL   RFC: XAXX010101000   Uso CFDI: S01 (Sin efectos fiscales)');
    doc.text(`Fecha: ${resumen.fecha}   Lugar de expedición: ${e.lugarExpedicion}`);
    doc.text(`Forma de pago: ${resumen.formaPago}   Método de pago: PUE   Moneda: MXN`);
    doc.moveDown();

    // Tabla de conceptos
    const x = { cant: 50, desc: 90, unit: 360, imp: 440, iva: 510 };
    let y = doc.y;
    doc.fillColor(CIRUELA).fontSize(9);
    doc.text('Cant.', x.cant, y).text('Descripción', x.desc, y).text('Valor unit.', x.unit, y).text('Importe', x.imp, y).text('IVA 16 %', x.iva, y);
    y += 16;
    doc.moveTo(50, y - 4).lineTo(562, y - 4).strokeColor('#E5DAD1').stroke();
    doc.fillColor('#2B2320');
    for (const c of resumen.conceptos) {
      const alto = Math.max(doc.heightOfString(`${c.descripcion} (${c.noIdentificacion})`, { width: 260 }), 12);
      doc.text(String(c.cantidad), x.cant, y);
      doc.text(`${c.descripcion} (${c.noIdentificacion})`, x.desc, y, { width: 260 });
      doc.text(dinero(c.valorUnitario), x.unit, y);
      doc.text(dinero(c.base), x.imp, y);
      doc.text(dinero(c.iva), x.iva, y);
      y += alto + 6;
    }
    doc.moveTo(50, y).lineTo(562, y).strokeColor('#E5DAD1').stroke();
    y += 10;
    doc.fontSize(10);
    doc.text(`Subtotal: ${dinero(resumen.subTotal)}`, 380, y, { width: 182, align: 'right' });
    doc.text(`IVA trasladado: ${dinero(resumen.totalIva)}`, 380, y + 14, { width: 182, align: 'right' });
    doc.fillColor(CIRUELA).fontSize(12).text(`Total: ${dinero(resumen.total)}`, 380, y + 30, { width: 182, align: 'right' });

    doc.fillColor(GRIS).fontSize(8).text(
      'Este documento es una prefactura generada por Nuvé a partir del pedido pagado. Para obtener una factura con validez ' +
        'fiscal se requiere el sellado con un certificado de sello digital y el timbrado por un Proveedor Autorizado de Certificación (PAC).',
      50,
      700,
      { width: 512 }
    );
    doc.end();
  });
}
