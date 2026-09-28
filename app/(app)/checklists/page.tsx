import Link from "next/link";
import { Franjas } from "@/components/Franjas";
import { obtenerContexto } from "@/lib/contexto";
import { diaOperativoMX, estadoCasilla } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { bolasNorma } from "@/lib/masa";
import { fueraDeRango } from "@/lib/amasado";
import { areaDelDia, diaSemanaISO } from "@/lib/limpiezaProfunda";
import type { AreaLimpieza, Checklist, CierreMerma, LecturaMasa, Momento, NormaMasa } from "@/lib/tipos";
import { contarListas, filasListas } from "@/lib/zonas";
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

  const esHoy = fecha === hoy;
  const totalMermas = mermas ?? 0;

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

      {porRevisar > 0 && <p className="aviso aviso-info">{porRevisar} {porRevisar === 1 ? "registro espera" : "registros esperan"} "Revisado" del encargado.</p>}

      <section className="seccion" aria-labelledby="t-ronda">
        <div className="acciones">
          <h2 id="t-ronda">Ronda de la hora</h2>
          {esHoy && !soloLectura && <Link className="boton" href="/checklists/ronda">Registrar</Link>}
        </div>
        {zonasRonda.map((c) => (
          <div key={c.id} className="formulario">
            <h3>{c.nombre}</h3>
            <Franjas titulo={c.nombre} casillas={casillasRonda(c)} />
          </div>
        ))}
      </section>

      <section className="seccion" aria-labelledby="t-turno">
        <div className="acciones">
          <h2 id="t-turno">Listas del turno · {conteoListas.hechas} de {conteoListas.total}</h2>
          {esHoy && !soloLectura && <Link className="boton" href="/checklists/turno">Abrir</Link>}
        </div>
        <TarjetasListas filas={filas} enlace={esHoy} />
      </section>

      <section className="seccion" aria-labelledby="t-otros">
        <h2 id="t-otros">Amasado y limpieza profunda</h2>
        <p>
          {(lotes ?? []).length} {(lotes ?? []).length === 1 ? "lote de amasado" : "lotes de amasado"}
          {lotesFuera ? <>, <span className="alerta-texto">{lotesFuera} fuera de rango</span></> : ""}.
        </p>
        <p>
          Limpieza profunda ({areaDelDia(areas ?? [], fecha) ?? "sin área"}):{" "}
          {limpieza ? `hecha por ${limpieza.empleado}${limpieza.revisado_por ? " y revisada" : ", falta revisar"}.` : "pendiente."}
        </p>
      </section>

      <section className="seccion" aria-labelledby="t-masa">
        <div className="acciones">
          <h2 id="t-masa">Temperatura de masa</h2>
          {esHoy && !soloLectura && <Link className="boton" href="/checklists/masa">Registrar</Link>}
        </div>
        <Franjas titulo="Horas de temperatura de masa" casillas={casillasMasa} />
      </section>

      <section className="seccion" aria-labelledby="t-recorrido">
        <div className="acciones">
          <h2 id="t-recorrido">Recorrido de supervisor</h2>
          {esHoy && !soloLectura && <Link className="boton" href="/checklists/recorrido">Registrar</Link>}
        </div>
        {listas.map((c) => (
          <div key={c.id} className="formulario">
            <h3>{c.nombre}</h3>
            <Franjas titulo={c.nombre} casillas={casillasRecorrido(c)} />
          </div>
        ))}
      </section>

      <section className="seccion" aria-labelledby="t-mermas">
        <div className="acciones">
          <h2 id="t-mermas">Mermas</h2>
          {esHoy && !soloLectura && <Link className="boton" href="/checklists/mermas">Registrar</Link>}
        </div>
        <p>
          {totalMermas} {totalMermas === 1 ? "merma registrada" : "mermas registradas"}.{" "}
          {cierre ? `Cerradas a las ${hora(cierre.cerrado_en)} y capturadas en Dodo IS.` : "Falta cerrarlas."}
        </p>
      </section>
    </>
  );
}
