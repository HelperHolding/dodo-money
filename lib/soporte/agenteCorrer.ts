import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createAnthropic } from "@ai-sdk/anthropic";
import { consultasIA } from "@/lib/ia/consultas";
import type { FuenteIA } from "@/lib/ia/validacion";
import { hoyCalendarioMX } from "@/lib/formato";
import { BUCKET_SOPORTE } from "@/lib/soporte";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { leerTickets } from "@/app/soporte/datos";
import { atenderTicket, textoPublico, type ConsultasAgente } from "./agente";
import { describirError } from "./errorAgente";

const IMAGEN: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Una corrida del agente para un ticket recién levantado. Lee con la sesión de quien reporta (su RLS) y cierra con la
 * llave de servicio. Nunca lanza: cualquier falla termina en 'fallido' y el ticket se atiende como siempre.
 */
export async function atenderConAgente(o: { numero: number; token: string; rol: string; sucursalId: string | null }): Promise<void> {
  const admin = crearClienteAdmin();
  let ticketId: string | null = null;
  try {
    const usuario = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${o.token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const [t] = await leerTickets(usuario, o.numero);
    if (!t || t.agente_estado !== "pendiente") return;
    ticketId = t.id;
    const apiKey = process.env.ANTHROPIC_API_KEY, modeloId = process.env.ANTHROPIC_MODEL;
    if (!apiKey || !modeloId) throw new Error("sin-configuracion");
    let imagen: { datos: Uint8Array; tipo: string } | null = null;
    const ext = t.captura?.split(".").pop()?.toLowerCase();
    if (t.captura && ext && IMAGEN[ext]) {
      const { data } = await usuario.storage.from(BUCKET_SOPORTE).download(t.captura);
      if (data && data.size <= 4 * 1024 * 1024) imagen = { datos: new Uint8Array(await data.arrayBuffer()), tipo: IMAGEN[ext] };
    }
    const sucursal = o.rol === "gerente" ? o.sucursalId : null;
    const fuentes: FuenteIA[] = [];
    const todas = consultasIA(usuario, sucursal, o.rol, fuentes);
    const consultas: ConsultasAgente = o.rol === "gerente" && !sucursal ? { manuales: todas.manuales } : todas;
    const r = await atenderTicket({
      modelo: createAnthropic({ apiKey })(modeloId), consultas,
      parecidos: async (b) => (await admin.rpc("soporte_tickets_parecidos", { p_ticket: t.id, p_busqueda: b })).data ?? [],
      ticket: { numero: t.numero, tipo: t.tipo, titulo: t.titulo, descripcion: t.descripcion, seccion: t.seccion, ruta_origen: t.ruta_origen,
        bloquea: t.bloquea, rol: o.rol, sucursal: t.sucursal, creador: t.creador, responsable: t.responsable_nombre },
      imagen, signal: AbortSignal.timeout(45000), hoy: hoyCalendarioMX(),
    });
    const fuentesTexto = fuentes.length ? `\n\nFuentes consultadas:\n${fuentes.map((f) => `- ${f.titulo} (${f.href})`).join("\n")}` : "";
    const { error } = await admin.rpc("agente_cerrar_ticket", {
      p_ticket: t.id, p_desenlace: r.cierre.desenlace, p_publica: textoPublico(r.cierre, t.responsable_nombre),
      p_interna: `${r.cierre.nota_interna}${fuentesTexto}`.slice(0, 3000), p_prioridad: r.cierre.prioridad_sugerida,
      p_modelo: modeloId, p_entrada: r.entrada, p_salida: r.salida });
    if (error) throw new Error(`cierre-${error.code ?? "rpc"}`);
  } catch (e) {
    const tipo = describirError(e);
    console.error("agente soporte", o.numero, tipo);
    if (ticketId) {
      const { error } = await admin.rpc("agente_cerrar_ticket", { p_ticket: ticketId, p_desenlace: "fallido", p_publica: null,
        p_interna: `Tipo de error: ${tipo}`, p_prioridad: null, p_modelo: process.env.ANTHROPIC_MODEL ?? null, p_entrada: 0, p_salida: 0 });
      if (error) console.error("agente soporte no pudo marcar fallido", o.numero, error.code);
    }
  }
}
