import Link from "next/link";
import { Franjas } from "@/components/Franjas";
import { obtenerContexto } from "@/lib/contexto";
import { diaOperativoMX, estadoCasilla } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { bolasNorma } from "@/lib/masa";
import type { Checklist, CierreMerma, LecturaMasa, NormaMasa } from "@/lib/tipos";

type LecturaResumen = Pick<LecturaMasa, "hora" | "temp_area" | "bolas" | "en_norma">;
type RecorridoResumen = { checklist_id: string; hora: number; recorrido_respuestas: { cumple: boolean }[] };

export default async function Checklists({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: fechaPedida } = await searchParams;
  const ahora = new Date();
  const hoy = diaOperativoMX(ahora);
  const fecha = fechaPedida && /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida) ? fechaPedida : hoy;
  const { supabase, sucursal } = await obtenerContexto();

  const [{ data: normas }, { data: lecturas }, { data: checklists }, { data: recorridos }, { count: mermas }, { data: cierre }] =
    await Promise.all([
      supabase.from("normas_masa").select("hora, bolas_25, bolas_30, bolas_35").order("hora").returns<NormaMasa[]>(),
      supabase.from("lecturas_masa").select("hora, temp_area, bolas, en_norma")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).returns<LecturaResumen[]>(),
      supabase.from("checklists").select("id, clave, nombre, horas, roles").returns<Checklist[]>(),
      supabase.from("recorridos").select("checklist_id, hora, recorrido_respuestas(cumple)")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).returns<RecorridoResumen[]>(),
      supabase.from("mermas").select("id", { count: "exact", head: true }).eq("sucursal_id", sucursal.id).eq("fecha", fecha),
      supabase.from("cierres_merma").select("fecha, capturado_dodo, cerrado_por, cerrado_en")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<CierreMerma>(),
    ]);

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
        <p>Temperatura de masa y recorrido cada hora, y mermas del día. Cada hora se puede registrar hasta 10 minutos después de que termina.</p>
      </div>

      <form className="acciones" method="get">
        <label htmlFor="fecha" className="etiqueta">Día</label>
        <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
        <button className="boton boton-secundario" type="submit">Ver</button>
        {!esHoy && <Link href="/checklists">Volver a hoy</Link>}
      </form>
      <p className="saldo-nota">Listo: registrado y en norma · Revisar: fuera de norma o con puntos que no cumplen · Ahora: se puede registrar · Falta: no se registró a tiempo.</p>

      <section className="seccion" aria-labelledby="t-masa">
        <div className="acciones">
          <h2 id="t-masa">Temperatura de masa</h2>
          {esHoy && <Link className="boton" href="/checklists/masa">Registrar</Link>}
        </div>
        <Franjas titulo="Horas de temperatura de masa" casillas={casillasMasa} />
      </section>

      <section className="seccion" aria-labelledby="t-recorrido">
        <div className="acciones">
          <h2 id="t-recorrido">Recorrido de supervisor</h2>
          {esHoy && <Link className="boton" href="/checklists/recorrido">Registrar</Link>}
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
          {esHoy && <Link className="boton" href="/checklists/mermas">Registrar</Link>}
        </div>
        <p>
          {totalMermas} {totalMermas === 1 ? "merma registrada" : "mermas registradas"}.{" "}
          {cierre ? `Cerradas a las ${hora(cierre.cerrado_en)} y capturadas en Dodo IS.` : "Falta cerrarlas."}
        </p>
      </section>
    </>
  );
}
