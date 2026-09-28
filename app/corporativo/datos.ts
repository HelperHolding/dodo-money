import type { SupabaseClient } from "@supabase/supabase-js";
import { fueraDeRango } from "@/lib/amasado";
import { primerError, type DatosSucursal } from "@/lib/corporativo";
import { estadoFranja } from "@/lib/franjas";
import { rangoDiaMX } from "@/lib/formato";
import { diaSemanaISO } from "@/lib/limpiezaProfunda";
import { bolasNorma } from "@/lib/masa";
import type { Checklist, Momento, NormaMasa, TempArea } from "@/lib/tipos";
import { contarListas, filasListas } from "@/lib/zonas";

/** Todas las sucursales en un día: una consulta por tabla, no una por sucursal. */
export async function datosCorporativo(supabase: SupabaseClient, fecha: string, ahora: Date): Promise<DatosSucursal[]> {
  const { desde, hasta } = rangoDiaMX(fecha);
  const resultados = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("turnos").select("id, sucursal_id, cerrado_en").eq("fecha", fecha)
      .returns<{ id: string; sucursal_id: string; cerrado_en: string | null }[]>(),
    supabase.from("movimientos").select("sucursal_id, tipo, estado, monto").gte("creado_en", desde).lt("creado_en", hasta)
      .returns<{ sucursal_id: string; tipo: string; estado: string; monto: number }[]>(),
    supabase.from("cierres_dia").select("sucursal_id, cerrado_en, venta_total, boveda_diferencia").eq("fecha", fecha)
      .returns<{ sucursal_id: string; cerrado_en: string; venta_total: number; boveda_diferencia: number }[]>(),
    supabase.from("normas_masa").select("hora, bolas_25, bolas_30, bolas_35").returns<NormaMasa[]>(),
    supabase.from("lecturas_masa").select("sucursal_id, hora, temp_area, bolas, en_norma").eq("fecha", fecha)
      .returns<{ sucursal_id: string; hora: number; temp_area: TempArea; bolas: number; en_norma: boolean }[]>(),
    supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").returns<Checklist[]>(),
    supabase.from("recorridos").select("sucursal_id, checklist_id, hora, recorrido_respuestas(cumple)").eq("fecha", fecha)
      .returns<{ sucursal_id: string; checklist_id: string; hora: number; recorrido_respuestas: { cumple: boolean }[] }[]>(),
    supabase.from("cierres_merma").select("sucursal_id").eq("fecha", fecha).returns<{ sucursal_id: string }[]>(),
    supabase.from("mermas").select("sucursal_id").eq("fecha", fecha).returns<{ sucursal_id: string }[]>(),
    supabase.from("gastos_caja_chica").select("sucursal_id, monto, comprobante").eq("fecha", fecha)
      .returns<{ sucursal_id: string; monto: number; comprobante: string }[]>(),
    supabase.from("checklist_puntos").select("checklist_id, momento, dia_semana")
      .returns<{ checklist_id: string; momento: Momento; dia_semana: number | null }[]>(),
    supabase.from("registros_checklist").select("sucursal_id, checklist_id, momento, hora, revisado_por, registro_respuestas(cumple)").eq("fecha", fecha)
      .returns<{ sucursal_id: string; checklist_id: string; momento: Momento; hora: number | null; revisado_por: string | null; registro_respuestas: { cumple: boolean }[] }[]>(),
    supabase.from("lotes_amasado").select("sucursal_id, temp_masa, temp_sala, temp_harina, temp_agua").eq("fecha", fecha)
      .returns<{ sucursal_id: string; temp_masa: number; temp_sala: number; temp_harina: number; temp_agua: number }[]>(),
    supabase.from("limpiezas_profundas").select("sucursal_id").eq("fecha", fecha).returns<{ sucursal_id: string }[]>(),
  ]);
  const errorCarga = primerError(resultados);
  if (errorCarga) throw new Error(`No se pudieron cargar los datos: ${errorCarga}`);
  const [
    { data: sucursales }, { data: turnos }, { data: movimientos }, { data: cierres },
    { data: normas }, { data: lecturas }, { data: checklists }, { data: recorridos },
    { data: cierresMerma }, { data: mermas }, { data: gastos },
    { data: puntosListas }, { data: registrosListas }, { data: lotes }, { data: limpiezas },
  ] = resultados;

  const idsTurnos = (turnos ?? []).map((t) => t.id);
  const { data: arqueos, error: errorArqueos } = idsTurnos.length
    ? await supabase.from("arqueos").select("turno_id, diferencia").in("turno_id", idsTurnos).eq("momento", "cierre")
        .returns<{ turno_id: string; diferencia: number }[]>()
    : { data: [] as { turno_id: string; diferencia: number }[], error: null };
  if (errorArqueos) throw new Error(`No se pudieron cargar los arqueos: ${errorArqueos.message}`);

  const sucursalDeTurno = new Map((turnos ?? []).map((t) => [t.id, t.sucursal_id]));
  const normaPorHora = new Map((normas ?? []).map((n) => [n.hora, n]));
  const horasMasa = [...normaPorHora.keys()];
  const recorridos_ = (checklists ?? []).filter((c) => c.tipo === "recorrido");
  const horasRecorrido = recorridos_.flatMap((c) => c.horas.map((h) => ({ checklistId: c.id, hora: h })));
  const listasCl = (checklists ?? []).filter((c) => c.tipo === "lista");
  const horasRonda = listasCl.filter((c) => c.en_ronda).flatMap((c) => c.horas.map((h) => ({ checklistId: c.id, hora: h })));
  const diaSemana = diaSemanaISO(fecha);
  const cerrada = (h: number) => estadoFranja({ fecha, hora: h }, ahora) === "cerrada";
  const de = <T extends { sucursal_id: string }>(filas: T[] | null, id: string) => (filas ?? []).filter((f) => f.sucursal_id === id);

  return (sucursales ?? []).map((s) => {
    const ts = de(turnos, s.id);
    const ms = de(movimientos, s.id);
    const cierre = de(cierres, s.id)[0];
    const ls = de(lecturas, s.id);
    const rs = de(recorridos, s.id);
    const gs = de(gastos, s.id);
    const horasConLectura = new Set(ls.map((l) => l.hora));
    const recorridosHechos = new Set(rs.map((r) => `${r.checklist_id}|${r.hora}`));
    const arqueosDeSucursal = (arqueos ?? []).filter((a) => sucursalDeTurno.get(a.turno_id) === s.id);
    const rl = de(registrosListas, s.id);
    const rondasHechas = rl.filter((r) => r.momento === "hora");
    const hechasRonda = new Set(rondasHechas.map((r) => `${r.checklist_id}|${r.hora}`));
    const conteoListas = contarListas(filasListas(listasCl, puntosListas ?? [], rl.filter((r) => r.momento !== "hora"), diaSemana));

    return {
      id: s.id,
      nombre: s.nombre,
      turnosAbiertos: ts.filter((t) => !t.cerrado_en).length,
      turnosCerrados: ts.filter((t) => t.cerrado_en).length,
      diferenciaArqueos: arqueosDeSucursal.reduce((suma, a) => suma + Number(a.diferencia), 0),
      arqueosDescuadrados: arqueosDeSucursal.filter((a) => Math.round(Number(a.diferencia) * 100) !== 0).length,
      pendientes: ms.filter((m) => m.estado === "pendiente").length,
      deposito: ms.filter((m) => m.tipo === "deposito_banco" && m.estado === "confirmado")
        .reduce((suma, m) => suma + Number(m.monto), 0),
      cierre: cierre
        ? { cerradoEn: cierre.cerrado_en, ventaTotal: Number(cierre.venta_total), bovedaDiferencia: Number(cierre.boveda_diferencia) }
        : null,
      masa: {
        total: horasMasa.length,
        registradas: ls.length,
        faltantes: horasMasa.filter((h) => !horasConLectura.has(h) && cerrada(h)).length,
        fueraDeNorma: ls.filter((l) => {
          const n = normaPorHora.get(l.hora);
          return !l.en_norma || (n !== undefined && l.bolas !== bolasNorma(n, l.temp_area));
        }).length,
      },
      recorrido: {
        total: horasRecorrido.length,
        hechos: rs.length,
        faltantes: horasRecorrido.filter((x) => !recorridosHechos.has(`${x.checklistId}|${x.hora}`) && cerrada(x.hora)).length,
        conFallas: rs.filter((r) => r.recorrido_respuestas.some((x) => !x.cumple)).length,
      },
      mermasCerradas: de(cierresMerma, s.id).length > 0,
      mermas: de(mermas, s.id).length,
      gastos: gs.reduce((suma, g) => suma + Number(g.monto), 0),
      sinComprobante: gs.filter((g) => g.comprobante === "sin_comprobante").length,
      rondas: {
        total: horasRonda.length,
        hechas: rondasHechas.length,
        faltantes: horasRonda.filter((x) => !hechasRonda.has(`${x.checklistId}|${x.hora}`) && cerrada(x.hora)).length,
        conFallas: rondasHechas.filter((r) => r.registro_respuestas.some((x) => !x.cumple)).length,
      },
      listas: conteoListas,
      amasadoFuera: de(lotes, s.id).filter((l) => fueraDeRango({ masa: Number(l.temp_masa), sala: Number(l.temp_sala), harina: Number(l.temp_harina), agua: Number(l.temp_agua) }).length).length,
      limpiezaProfunda: de(limpiezas, s.id).length > 0,
    };
  });
}
