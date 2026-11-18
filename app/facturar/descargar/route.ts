import { crearClienteAdmin } from "@/lib/supabase/admin";
import { facturapi } from "@/lib/facturacion/servidor";
export const dynamic = "force-dynamic";

/** /facturar/descargar?f=<id>&t=<token>&formato=pdf|xml → redirige a la URL temporal de Facturapi. El token solo lo recibe quien timbró. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, formato = q.get("formato") === "xml" ? "xml" : "pdf";
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(q.get("f") ?? "") || !uuid.test(q.get("t") ?? "")) return new Response("Enlace inválido.", { status: 404 });
  const { data } = await crearClienteAdmin().rpc("facturacion_para_descarga", { p_id: q.get("f"), p_token: q.get("t") });
  if (!data) return new Response("Enlace inválido.", { status: 404 });
  const r = await facturapi().urlDescarga(data as string, formato);
  if (!r.ok) return new Response("No pudimos obtener el archivo. Intenta en un momento.", { status: 502 });
  return Response.redirect(r.valor, 302);
}
