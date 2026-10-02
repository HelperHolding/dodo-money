"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeGestionar } from "@/lib/contexto";
import { totalConteo } from "@/lib/denominaciones";
import { retiroABoveda } from "@/lib/fondos";
import { numero, numeroOpcional, pesos } from "@/lib/formato";
import type { MomentoArqueo } from "@/lib/tipos";
import { pideVentas } from "@/lib/arqueo";
import { fondoYRetirosDelTurno } from "./datos";

const error = (texto: string) => redirect("/arqueo?error=" + encodeURIComponent(texto));

export async function registrarArqueo(formData: FormData) {
  const { supabase, sucursal, turno } = await obtenerContextoParaEscribir("/arqueo");
  if (!turno) error("No hay turno abierto. El encargado debe abrirlo desde Inicio.");

  let conteo: Record<string, number> = {};
  try { conteo = JSON.parse(String(formData.get("conteo") ?? "{}")); } catch { error("No se pudo leer el conteo. Vuelve a capturarlo."); }
  const total = totalConteo(conteo);
  const momento = String(formData.get("momento")) as MomentoArqueo;
  if (!["inicio", "traspaso", "cierre"].includes(momento)) error("Elige si es inicio, traspaso o cierre.");

  // El fondo y los retiros se calculan en el servidor con los movimientos confirmados, no se capturan.
  const { fondo, retiros } = await fondoYRetirosDelTurno(supabase, turno!.id, Number(sucursal.fondo_caja_venta));

  const { error: e } = await supabase.from("arqueos").insert({
    turno_id: turno!.id,
    momento,
    conteo,
    total_contado: total,
    fondo_inicial: fondo,
    // Al inicio de turno no hay ventas: se guarda 0 aunque llegue algo en el campo.
    ventas_efectivo: pideVentas(momento) ? numero(formData.get("ventas_efectivo")) : 0,
    retiros_boveda: retiros,
    tarjeta_real: numeroOpcional(formData.get("tarjeta_real")),
    tarjeta_sistema: numeroOpcional(formData.get("tarjeta_sistema")),
    app_real: numeroOpcional(formData.get("app_real")),
    app_sistema: numeroOpcional(formData.get("app_sistema")),
    rappi_real: numeroOpcional(formData.get("rappi_real")),
    rappi_sistema: numeroOpcional(formData.get("rappi_sistema")),
    transacciones: numeroOpcional(formData.get("transacciones")),
    ticket_promedio: numeroOpcional(formData.get("ticket_promedio")),
    explicacion: String(formData.get("explicacion") ?? "").trim() || null,
  });
  if (e) error(e.message);

  revalidatePath("/", "layout");
  const texto = momento === "cierre"
    ? `Arqueo de cierre guardado y turno cerrado. Retira ${pesos(retiroABoveda(total, Number(sucursal.fondo_caja_venta)))} a la bóveda para dejar ${pesos(Number(sucursal.fondo_caja_venta))} en el cajón.`
    : "Arqueo guardado. Quien recibe debe confirmarlo con su usuario.";
  redirect("/arqueo?ok=" + encodeURIComponent(texto));
}

/** El gerente o el admin anulan un arqueo equivocado (por ejemplo, un inicio duplicado). No se borra: queda tachado con su motivo. */
export async function anularArqueo(formData: FormData) {
  const { supabase, perfil } = await obtenerContextoParaEscribir("/arqueo");
  if (!puedeGestionar(perfil.rol)) error("Solo el gerente o el admin anulan un arqueo.");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) error("Escribe por qué se anula el arqueo.");
  const { error: e } = await supabase.rpc("anular_arqueo", { p_id: String(formData.get("id") ?? ""), p_motivo: motivo });
  if (e) error(e.message);
  revalidatePath("/", "layout");
  redirect("/arqueo?ok=" + encodeURIComponent("Arqueo anulado. Ya no cuenta en las diferencias."));
}

export async function recibirArqueo(formData: FormData) {
  const { supabase } = await obtenerContextoParaEscribir("/arqueo");
  const { error: e } = await supabase.rpc("recibir_arqueo", { p_id: String(formData.get("id")) });
  if (e) error(e.message);
  revalidatePath("/arqueo");
  redirect("/arqueo?ok=" + encodeURIComponent("Arqueo recibido."));
}
