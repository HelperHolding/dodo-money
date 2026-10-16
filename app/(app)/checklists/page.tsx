import Link from "next/link";
import { Avance } from "@/components/Avance";
import { Franjas } from "@/components/Franjas";
import { obtenerContexto } from "@/lib/contexto";
import { diaOperativoMX, estadoCasilla } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { bolasNorma } from "@/lib/masa";
import { fueraDeRango } from "@/lib/amasado";
import { areaDelDia, diaSemanaISO } from "@/lib/limpiezaProfunda";
import type { AreaLimpieza, Checklist, CierreMerma, LecturaMasa, Momento, NormaMasa } from "@/lib/tipos";
import { contarListas, filasListas } from "@/lib/zonas";
import { Plegable } from "@/components/Plegable";
import { TarjetasListas } from "./TarjetasListas";

type LecturaResumen = Pick<LecturaMasa, "hora" | "temp_area" | "bolas" | "en_norma">;
type RecorridoResumen = { checklist_id: string; hora: number; recorrido_respuestas: { cumple: boolean }[] };

export default async function Checklists({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: fechaPedida } = await searchParams;
  const ahora = new Date();
  const hoy = diaOperativoMX(ahora);
  const fecha = fechaPedida && /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida) ? fechaPedida : hoy;
  const { supabase, sucursal, soloLectura } = await obtenerContexto();

  const [{ data: normas }, { data: lecturas }, { data: checklists }, { data: recorridos }, { count: mermas }, { data: cierre }] =
    await Promise.all([
      supabase.from("normas_masa").select("hora, bolas_25, bolas_30, bolas_35").order("hora").returns<NormaMasa[]>(),
      supabase.from("lecturas_masa").select("hora, temp_area, bolas, en_norma")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).returns<LecturaResumen[]>(),
      supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").eq("tipo", "recorrido").returns<Checklist[]>(),
      supabase.from("recorridos").select("checklist_id, hora, recorrido_respuestas(cumple)")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).returns<RecorridoResumen[]>(),
      supabase.from("mermas").select("id", { count: "exact", head: true }).eq("sucursal_id", sucursal.id).eq("fecha", fecha),
      supabase.from("cierres_merma").select("fecha, capturado_dodo, cerrado_por, cerrado_en")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<CierreMerma>(),
    ]);

  const [{ data: listasZonas }, { data: puntosListas }, { data: registrosListas }, { data: lotes }, { data: areas }, { data: limpieza }] =
    await Promise.all([
      supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").eq("tipo", "lista").order("orden").returns<Checklist[]>(),
      supabase.from("checklist_puntos").select("checklist_id, momento, dia_semana")
        .returns<{ checklist_id: string; momento: Momento; dia_semana: number | null }[]>(),
      supabase.from("registros_checklist").select("checklist_id, momento, hora, revisado_por, registro_respuestas(cumple)")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha)
        .returns<{ checklist_id: string; momento: Momento; hora: number | null; revisado_por: string | null; registro_respuestas: { cumple: boolean }[] }[]>(),
      supabase.from("lotes_amasado").select("temp_masa, temp_sala, temp_harina, temp_agua, revisado_por").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
        .returns<{ temp_masa: number; temp_sala: number; temp_harina: number; temp_agua: number; revisado_por: string | null }[]>(),
      supabase.from("areas_limpieza_profunda").select("semana, dia_semana, area").returns<AreaLimpieza[]>(),
      supabase.from("limpiezas_profundas").select("empleado, revisado_por").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
        .maybeSingle<{ empleado: string; revisado_por: string | null }>(),
    ]);

  const zonasRonda = (listasZonas ?? []).filter((c) => c.en_ronda);
  const casillasRonda = (c: Checklist) => c.horas.map((h) => {
    const r = (registrosListas ?? []).find((x) => x.checklist_id === c.id && x.momento === "hora" && x.hora === h);
    const registro = !r ? undefined : r.registro_respuestas.every((x) => x.cumple) ? ("ok" as const) : ("alerta" as const);
    return { hora: h, estado: estadoCasilla(registro, { fecha, hora: h }, ahora) };
  });
  const filas = filasListas(listasZonas ?? [], puntosListas ?? [], (registrosListas ?? []).filter((r) => r.momento !== "hora"), diaSemanaISO(fecha));
  const conteoListas = contarListas(filas);
  const lotesFuera = (lotes ?? []).filter((l) => fueraDeRango({ masa: Number(l.temp_masa), sala: Number(l.temp_sala), harina: Number(l.temp_harina), agua: Number(l.temp_agua) }).length).length;
  const porRevisar = (registrosListas ?? []).filter((r) => !r.revisado_por).length
    + (lotes ?? []).filter((l) => !l.revisado_por).length + (limpieza && !limpieza.revisado_por ? 1 : 0);

  const lecturaPorHora = new Map((lecturas ?? []).map((l) => [l.hora, l]));
  const casillasMasa = (normas ?? []).map((n) => {
    const l = lecturaPorHora.get(n.hora);
    const registro = !l ? undefined : l.en_norma && l.bolas === bolasNorma(n, l.temp_area) ? ("ok" as const) : ("alerta" as const);
    return { hora: n.hora, estado: estadoCasilla(registro, { fecha, hora: n.hora }, ahora) };
  });

  const listas = [...(checklists ?? [])].sort((a, b) => a.horas[0] - b.horas[0]);
  const casillasRecorrido = (c: Checklist) =>
    c.horas.map((h) => {
      const r = (recorridos ?? []).find((x) => x.checklist_id === c.id && x.hora === h);
      const registro = !r ? undefined : r.recorrido_respuestas.every((x) => x.cumple) ? ("ok" as const) : ("alerta" as const);
      return { hora: h, estado: estadoCasilla(registro, { fecha, hora: h }, ahora) };
    });

  const rondasHechas = (registrosListas ?? []).filter((r) => r.momento === "hora");
  const hechasRonda = rondasHechas.length;
  const totalRonda = zonasRonda.reduce((s, c) => s + c.horas.length, 0);
  const fallasRonda = rondasHechas.filter((r) => r.registro_respuestas.some((x) => !x.cumple)).length;
  const masaFuera = casillasMasa.filter((c) => c.estado === "alerta").length;
  const totalRecorrido = listas.reduce((s, c) => s + c.horas.length, 0);
  const esHoy = fecha === hoy;
  const totalMermas = mermas ?? 0;
  // Avance del día: horas y listas registradas de todo lo que tiene casillas.
  const hechasDia = hechasRonda + conteoListas.hechas + (lecturas ?? []).length + (recorridos ?? []).length;
  const totalDia = totalRonda + conteoListas.total + (normas ?? []).length + totalRecorrido;

  return (
    <>
      <div className="encabezado">
        <h1>Checklists</h1>
        <p>Rondas y listas de las zonas, temperatura de masa, recorrido, amasado, limpieza profunda y mermas del día. Cada hora se puede registrar hasta 10 minutos después de que termina.</p>
      </div>

      <form className="acciones" method="get">
        <label htmlFor="fecha" className="etiqueta">Día</label>
        <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
        <button className="boton boton-secundario" type="submit">Ver</button>
        {!esHoy && <Link href="/checklists">Volver a hoy</Link>}
      </form>
      <p className="saldo-nota">Listo: registrado y en norma · Revisar: fuera de norma o con puntos que no cumplen · Ahora: se puede registrar · Falta: no se registró a tiempo.</p>

      {totalDia > 0 && (
        <section className="seccion" aria-label="Avance del día">
          <Avance etiqueta={esHoy ? "Avance de hoy" : `Avance del ${fecha}`} hechas={hechasDia} total={totalDia}
            alerta={fallasRonda + masaFuera + lotesFuera > 0} />
        </section>
      )}

      {porRevisar > 0 && <p className="aviso aviso-info">{porRevisar} {porRevisar === 1 ? "registro espera" : "registros esperan"} "Revisado" del encargado.</p>}

      <Plegable id="t-ronda" titulo="Ronda de la hora" alerta={fallasRonda > 0} avance={{ hechas: hechasRonda, total: totalRonda }}
        resumen={`${hechasRonda} de ${totalRonda} horas${fallasRonda ? ` · ${fallasRonda} con fallas` : ""}`}>
        {esHoy && !soloLectura && <Link className="boton" href="/checklists/ronda">Registrar ronda</Link>}
        {zonasRonda.map((c) => (
          <div key={c.id} className="formulario">
            <h3>{c.nombre}</h3>
            <Franjas titulo={c.nombre} casillas={casillasRonda(c)} />
          </div>
        ))}
      </Plegable>

      <Plegable id="t-turno" titulo="Listas del turno" avance={{ hechas: conteoListas.hechas, total: conteoListas.total }} resumen={`${conteoListas.hechas} de ${conteoListas.total} hechas`}>
        {esHoy && !soloLectura && <Link className="boton" href="/checklists/turno">Abrir listas</Link>}
        <TarjetasListas filas={filas} enlace={esHoy} />
      </Plegable>

      <Plegable id="t-otros" titulo="Amasado y limpieza profunda" alerta={lotesFuera > 0}
        resumen={`${(lotes ?? []).length} ${(lotes ?? []).length === 1 ? "lote" : "lotes"}${lotesFuera ? ` · ${lotesFuera} fuera de rango` : ""} · limpieza ${limpieza ? "hecha" : "pendiente"}`}>
        <p>
          {(lotes ?? []).length} {(lotes ?? []).length === 1 ? "lote de amasado" : "lotes de amasado"}
          {lotesFuera ? <>, <span className="alerta-texto">{lotesFuera} fuera de rango</span></> : ""}.
        </p>
        <p>
          Limpieza profunda ({areaDelDia(areas ?? [], fecha) ?? "sin área"}):{" "}
          {limpieza ? `hecha por ${limpieza.empleado}${limpieza.revisado_por ? " y revisada" : ", falta revisar"}.` : "pendiente."}
        </p>
      </Plegable>

      <Plegable id="t-masa" titulo="Temperatura de masa" alerta={masaFuera > 0} avance={{ hechas: (lecturas ?? []).length, total: (normas ?? []).length }}
        resumen={`${(lecturas ?? []).length} de ${(normas ?? []).length} horas${masaFuera ? ` · ${masaFuera} por revisar` : ""}`}>
        {esHoy && !soloLectura && <Link className="boton" href="/checklists/masa">Registrar masa</Link>}
        <Franjas titulo="Horas de temperatura de masa" casillas={casillasMasa} />
      </Plegable>

      <Plegable id="t-recorrido" titulo="Recorrido de supervisor" avance={{ hechas: (recorridos ?? []).length, total: totalRecorrido }} resumen={`${(recorridos ?? []).length} de ${totalRecorrido} horas`}>
        {esHoy && !soloLectura && <Link className="boton" href="/checklists/recorrido">Registrar recorrido</Link>}
        {listas.map((c) => (
          <div key={c.id} className="formulario">
            <h3>{c.nombre}</h3>
            <Franjas titulo={c.nombre} casillas={casillasRecorrido(c)} />
          </div>
        ))}
      </Plegable>

      <Plegable id="t-mermas" titulo="Mermas" resumen={`${totalMermas} · ${cierre ? "cerradas" : "sin cerrar"}`}>
        {esHoy && !soloLectura && <Link className="boton" href="/checklists/mermas">Registrar mermas</Link>}
        <p>
          {totalMermas} {totalMermas === 1 ? "merma registrada" : "mermas registradas"}.{" "}
          {cierre ? `Cerradas a las ${hora(cierre.cerrado_en)} y capturadas en Dodo IS.` : "Falta cerrarlas."}
        </p>
      </Plegable>
    </>
  );
}
