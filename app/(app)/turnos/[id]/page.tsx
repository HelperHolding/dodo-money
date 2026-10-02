import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { fechaTexto } from "@/lib/formato";
import { puedeVerTurnos } from "@/lib/roles";
import { cargarDia, fechaDeTurno } from "../datos";
import { lineaTurno, ResumenTurnoDatos, TablaArqueos, TablaGastos, TablaMovimientos } from "../Secciones";

export default async function DetalleTurno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil, sucursal, cajas } = await obtenerContexto();
  if (!puedeVerTurnos(perfil.rol)) redirect("/");
  const fecha = await fechaDeTurno(supabase, sucursal.id, id);
  if (!fecha) notFound();
  const dia = await cargarDia(supabase, sucursal.id, fecha, new Date());
  const t = dia.turnos.find((x) => x.turno.id === id);
  if (!t) notFound();
  const caja = new Map(cajas.map((c) => [c.id, c.nombre]));

  return (
    <>
      <div className="encabezado">
        <p><Link href={`/turnos?fecha=${fecha}`}>← Turnos de {fechaTexto(fecha)}</Link></p>
        <h1>Turno {t.turno.tipo} · {fechaTexto(fecha)}</h1>
        <p>{lineaTurno(t.turno, dia.persona)}</p>
      </div>
      <div className="acciones">
        <Link className="boton" href={`/reporte/turno/${id}`} target="_blank">Reporte del turno (PDF)</Link>
      </div>

      <section className="seccion" aria-labelledby="t-resumen">
        <h2 id="t-resumen">Resumen</h2>
        <ResumenTurnoDatos t={t} />
      </section>

      <section className="seccion" aria-labelledby="t-arqueos">
        <h2 id="t-arqueos">Arqueos</h2>
        <TablaArqueos arqueos={t.arqueos} persona={dia.persona} />
      </section>
      <section className="seccion" aria-labelledby="t-movs">
        <h2 id="t-movs">Movimientos ({t.movimientos.length})</h2>
        <TablaMovimientos movimientos={t.movimientos} persona={dia.persona} caja={caja} />
      </section>
      <section className="seccion" aria-labelledby="t-gastos">
        <h2 id="t-gastos">Gastos ({t.gastos.length})</h2>
        <TablaGastos gastos={t.gastos} persona={dia.persona} />
      </section>
    </>
  );
}
