// front/src/pages/api/pedido/prefactura.ts
// Descarga de la prefactura (estructura CFDI) de un pedido pagado, enviado o entregado.
//   GET /api/pedido/prefactura?id=12&formato=pdf   -> PDF (representación impresa)
//   GET /api/pedido/prefactura?id=12&formato=xml   -> XML validado contra el esquema del SAT
// Requiere sesión (regla de /api/pedido en middleware.ts). El backend decide si el
// usuario puede ver ese pedido: el dueño, el operador o el administrador.
import type { APIRoute } from 'astro';
import { gql } from '../../../lib/graphql';
import { json } from '../../../lib/acciones';

interface Prefactura {
  folio: string;
  xml: string;
  pdfBase64: string;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const id = url.searchParams.get('id') ?? '';
  const formato = url.searchParams.get('formato') === 'xml' ? 'xml' : 'pdf';
  if (!/^\d+$/.test(id)) return json({ error: 'Pedido inválido.' }, 400);

  try {
    const { prefactura } = await gql<{ prefactura: Prefactura }>(
      `query ($id: ID!) { prefactura(pedidoId: $id) { folio xml pdfBase64 } }`,
      { id },
      locals.accessToken as string
    );
    const cuerpo = formato === 'xml' ? prefactura.xml : Buffer.from(prefactura.pdfBase64, 'base64');
    return new Response(cuerpo, {
      status: 200,
      headers: {
        'Content-Type': formato === 'xml' ? 'application/xml; charset=utf-8' : 'application/pdf',
        'Content-Disposition': `attachment; filename="prefactura-${prefactura.folio}.${formato}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'No se pudo generar la prefactura.' }, 400);
  }
};
