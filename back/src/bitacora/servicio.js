// back/src/bitacora/servicio.js
// Bitácora de eventos en MongoDB (base de documentos).
//
// PostgreSQL guarda los datos de la tienda (usuarios, productos, pedidos, pagos).
// MongoDB guarda la bitácora: un documento por evento importante (inicio de sesión,
// pedido creado, pago registrado, cambio de estado, inventario, prefactura...).
// Cada evento tiene forma libre en "datos", por eso encaja mejor en documentos.
//
// Reglas:
//   - Nunca se guardan contraseñas, tokens ni datos de tarjeta.
//   - Si MONGODB_URI no está configurado o MongoDB no responde, la tienda sigue
//     funcionando: el evento solo se omite (la bitácora no debe tumbar una compra).

import { MongoClient } from 'mongodb';

export const TIPOS_EVENTO = [
  'SESION_INICIADA',
  'SESION_FALLIDA',
  'USUARIO_REGISTRADO',
  'PASSWORD_CAMBIADA',
  'PEDIDO_CREADO',
  'PEDIDO_PAGADO',
  'PEDIDO_ESTADO_CAMBIADO',
  'PEDIDO_CANCELADO',
  'INVENTARIO_ACTUALIZADO',
  'PRODUCTO_GUARDADO',
  'PREFACTURA_GENERADA',
];

let cliente = null;
let coleccion = null;
let conectando = null;

export const bitacoraConfigurada = () => Boolean(process.env.MONGODB_URI);

async function obtenerColeccion() {
  if (!bitacoraConfigurada()) return null;
  if (coleccion) return coleccion;
  if (!conectando) {
    conectando = (async () => {
      cliente = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
      await cliente.connect();
      const db = cliente.db(process.env.MONGODB_DB || 'nuve');
      const c = db.collection('bitacora');
      await c.createIndex({ fecha: -1 });
      await c.createIndex({ tipo: 1, fecha: -1 });
      coleccion = c;
      return c;
    })().catch((e) => {
      console.error('[bitacora] No se pudo conectar con MongoDB:', e.message);
      conectando = null;
      cliente = null;
      return null;
    });
  }
  return conectando;
}

/**
 * Registra un evento. No lanza error nunca.
 * @param {string} tipo  uno de TIPOS_EVENTO
 * @param {{ usuarioId?: string|number|null, pedidoId?: string|number|null, datos?: object }} info
 */
export async function registrarEvento(tipo, { usuarioId = null, pedidoId = null, datos = {} } = {}) {
  try {
    const c = await obtenerColeccion();
    if (!c) return false;
    await c.insertOne({
      tipo,
      fecha: new Date(),
      usuarioId: usuarioId == null ? null : String(usuarioId),
      pedidoId: pedidoId == null ? null : String(pedidoId),
      datos,
    });
    return true;
  } catch (e) {
    console.error('[bitacora] No se registró el evento', tipo, e.message);
    return false;
  }
}

/** Eventos más recientes primero. Solo para el administrador. */
export async function consultarEventos({ tipo = null, limite = 50 } = {}) {
  const c = await obtenerColeccion();
  if (!c) return { disponible: false, eventos: [] };
  const tope = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const filtro = tipo ? { tipo } : {};
  const docs = await c.find(filtro).sort({ fecha: -1 }).limit(tope).toArray();
  return {
    disponible: true,
    eventos: docs.map((d) => ({
      id: String(d._id),
      tipo: d.tipo,
      fecha: d.fecha.toISOString(),
      usuarioId: d.usuarioId,
      pedidoId: d.pedidoId,
      datos: JSON.stringify(d.datos ?? {}),
    })),
  };
}

/** Ejecuta una tarea sin esperarla; si falla, solo se registra en consola (no afecta la respuesta). */
export function enSegundoPlano(promesa, etiqueta) {
  Promise.resolve(promesa).catch((e) => console.error(`[bitacora] ${etiqueta}:`, e.message));
}

/** Cierra la conexión (lo usan las pruebas automatizadas). */
export async function cerrarBitacora() {
  if (cliente) await cliente.close();
  cliente = null;
  coleccion = null;
  conectando = null;
}
