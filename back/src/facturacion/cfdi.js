// back/src/facturacion/cfdi.js
// Prefactura con la estructura del CFDI 4.0 (Anexo 20 del SAT).
//
// Qué es: el XML que se mandaría a un PAC para timbrar la factura de un pedido
// pagado. Lleva los nodos Comprobante, InformacionGlobal, Emisor, Receptor,
// Conceptos e Impuestos y se valida contra el esquema oficial del SAT (cfdv40.xsd)
// y sus catálogos (catCFDI.xsd, tdCFDI.xsd), que vienen en la carpeta xsd/.
//
// Qué NO es: una factura con validez fiscal. No lleva sello digital ni certificado
// (Sello y Certificado vacíos, NoCertificado en ceros) y no se timbra con un PAC.
//
// Versión: el SAT tiene vigente la versión 4.0 del CFDI; no existe una 4.1 publicada.
//
// Reglas de los importes (los precios de la tienda ya incluyen IVA del 16 %):
//   base = importe con IVA / 1.16 (redondeado a 2 decimales)
//   IVA  = importe con IVA - base
//   Total del comprobante = suma de importes con IVA = total del pedido.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateXML, memoryPages } from 'xmllint-wasm';
import { query } from '../db.js';
import { datosInvalidos } from '../auth/errores.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const XSD = (nombre) => fs.readFileSync(path.join(AQUI, 'xsd', nombre), 'utf8');

export const ESTADOS_FACTURABLES = ['PAGADO', 'ENVIADO', 'ENTREGADO'];
export const TASA_IVA = 0.16;

// Datos del emisor (la tienda). En producción van en variables de entorno.
// Por defecto se usa el RFC de pruebas que publica el SAT (EKU9003173C9).
export const emisor = () => ({
  rfc: process.env.CFDI_EMISOR_RFC || 'EKU9003173C9',
  nombre: process.env.CFDI_EMISOR_NOMBRE || 'NUVE BELLEZA INCLUSIVA',
  regimenFiscal: process.env.CFDI_EMISOR_REGIMEN || '601',
  lugarExpedicion: process.env.CFDI_LUGAR_EXPEDICION || '44100',
});

// Catálogos del SAT usados en cada concepto
export const CLAVE_PROD_SERV = '53131619'; // Cosméticos
export const CLAVE_UNIDAD = 'H87'; // Pieza

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const f2 = (n) => r2(n).toFixed(2);
const f6 = (n) => (Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6).toFixed(6);

const escapar = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const atributos = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${escapar(v)}"`)
    .join(' ');

/** Fecha en hora del centro de México con el formato que pide el SAT: AAAA-MM-DDThh:mm:ss */
export function fechaSat(fecha) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
      .formatToParts(new Date(fecha))
      .map((p) => [p.type, p.value])
  );
  const hora = partes.hour === '24' ? '00' : partes.hour;
  return `${partes.year}-${partes.month}-${partes.day}T${hora}:${partes.minute}:${partes.second}`;
}

/** Forma de pago del catálogo c_FormaPago según cómo se pagó el pedido. */
export function formaPago(pedido) {
  if (pedido.metodo_pago === 'PAYPAL') return '06'; // Dinero electrónico
  const esOxxo = pedido.oxxo_orden_id && pedido.transaccion_pago_id === pedido.oxxo_orden_id;
  return esOxxo ? '01' : '04'; // 01 Efectivo (OXXO) · 04 Tarjeta de crédito
}

/** Calcula base, IVA e importe de cada línea del pedido. */
export function calcularConceptos(lineas) {
  return lineas.map((l) => {
    const importeConIva = r2(Number(l.precio_unitario) * Number(l.cantidad));
    const base = r2(importeConIva / (1 + TASA_IVA));
    const iva = r2(importeConIva - base);
    return {
      noIdentificacion: l.sku,
      descripcion: `${l.producto}${l.tono ? ` - ${l.tono}` : ''}`,
      cantidad: Number(l.cantidad),
      valorUnitario: base / Number(l.cantidad),
      base,
      iva,
      importeConIva,
    };
  });
}

/**
 * Arma el XML de la prefactura con los datos ya leídos de la base.
 * Es una función pura (sin base de datos), por eso se puede probar directo.
 */
export function construirXml({ pedido, lineas, emisor: e = emisor() }) {
  const conceptos = calcularConceptos(lineas);
  const subTotal = r2(conceptos.reduce((s, c) => s + c.base, 0));
  const totalIva = r2(conceptos.reduce((s, c) => s + c.iva, 0));
  const total = r2(subTotal + totalIva);
  const fecha = fechaSat(pedido.fecha_pago ?? pedido.fecha);

  const comprobante = atributos({
    'xmlns:cfdi': 'http://www.sat.gob.mx/cfd/4',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
    Version: '4.0',
    Serie: 'NUV',
    Folio: String(pedido.id),
    Fecha: fecha,
    Sello: '',
    FormaPago: formaPago(pedido),
    NoCertificado: '00000000000000000000',
    Certificado: '',
    SubTotal: f2(subTotal),
    Moneda: 'MXN',
    Total: f2(total),
    TipoDeComprobante: 'I',
    Exportacion: '01',
    MetodoPago: 'PUE',
    LugarExpedicion: e.lugarExpedicion,
  });

  const xmlConceptos = conceptos
    .map(
      (c) => `    <cfdi:Concepto ${atributos({
        ClaveProdServ: CLAVE_PROD_SERV,
        NoIdentificacion: c.noIdentificacion,
        Cantidad: String(c.cantidad),
        ClaveUnidad: CLAVE_UNIDAD,
        Unidad: 'Pieza',
        Descripcion: c.descripcion,
        ValorUnitario: f6(c.valorUnitario),
        Importe: f2(c.base),
        ObjetoImp: '02',
      })}>
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado ${atributos({ Base: f2(c.base), Impuesto: '002', TipoFactor: 'Tasa', TasaOCuota: '0.160000', Importe: f2(c.iva) })}/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`
    )
    .join('\n');

  const [anio, mes] = fecha.split('-');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante ${comprobante}>
  <cfdi:InformacionGlobal ${atributos({ Periodicidad: '01', Meses: mes, 'Año': anio })}/>
  <cfdi:Emisor ${atributos({ Rfc: e.rfc, Nombre: e.nombre, RegimenFiscal: e.regimenFiscal })}/>
  <cfdi:Receptor ${atributos({
    Rfc: 'XAXX010101000',
    Nombre: 'PUBLICO EN GENERAL',
    DomicilioFiscalReceptor: e.lugarExpedicion,
    RegimenFiscalReceptor: '616',
    UsoCFDI: 'S01',
  })}/>
  <cfdi:Conceptos>
${xmlConceptos}
  </cfdi:Conceptos>
  <cfdi:Impuestos ${atributos({ TotalImpuestosTrasladados: f2(totalIva) })}>
    <cfdi:Traslados>
      <cfdi:Traslado ${atributos({ Base: f2(subTotal), Impuesto: '002', TipoFactor: 'Tasa', TasaOCuota: '0.160000', Importe: f2(totalIva) })}/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>
`;
  return { xml, resumen: { fecha, subTotal, totalIva, total, conceptos, emisor: e, formaPago: formaPago(pedido) } };
}

let esquemas = null;
/** Valida el XML contra cfdv40.xsd y los catálogos del SAT. Devuelve { valido, errores }. */
export async function validarXml(xml) {
  if (!esquemas) {
    esquemas = {
      schema: [{ fileName: 'cfdv40.xsd', contents: XSD('cfdv40.xsd') }],
      preload: [
        { fileName: 'catCFDI.xsd', contents: XSD('catCFDI.xsd') },
        { fileName: 'tdCFDI.xsd', contents: XSD('tdCFDI.xsd') },
      ],
    };
  }
  const r = await validateXML({
    xml: [{ fileName: 'prefactura.xml', contents: xml }],
    ...esquemas,
    initialMemoryPages: 256 * memoryPages.MiB,
    maxMemoryPages: 1024 * memoryPages.MiB,
  });
  return { valido: r.valid, errores: r.errors.map((err) => err.rawMessage) };
}

/** Lee el pedido de la base, arma la prefactura y la valida. */
export async function generarPrefactura(pedidoId) {
  const { rows } = await query(
    `SELECT id, usuario_id, fecha, fecha_pago, estado, total, metodo_pago, transaccion_pago_id, oxxo_orden_id
     FROM pedido WHERE id = $1`,
    [pedidoId]
  );
  const pedido = rows[0];
  if (!pedido) throw datosInvalidos('El pedido no existe.');
  if (!ESTADOS_FACTURABLES.includes(pedido.estado)) {
    throw datosInvalidos('La prefactura solo está disponible para pedidos pagados, enviados o entregados.');
  }
  const { rows: lineas } = await query(
    `SELECT d.cantidad, d.precio_unitario, v.sku, v.tono, p.nombre AS producto
     FROM detalle_pedido d
     JOIN variante_producto v ON v.id = d.variante_id
     JOIN producto p ON p.id = v.producto_id
     WHERE d.pedido_id = $1 ORDER BY d.id`,
    [pedidoId]
  );
  const { xml, resumen } = construirXml({ pedido, lineas });
  const { valido, errores } = await validarXml(xml);
  if (Math.abs(resumen.total - Number(pedido.total)) > 0.01) {
    errores.push(`El total de la prefactura (${resumen.total}) no coincide con el del pedido (${pedido.total}).`);
  }
  return { pedido, xml, resumen, valida: valido && errores.length === 0, errores };
}
