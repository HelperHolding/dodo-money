import { notFound, redirect } from "next/navigation";
import { cargarDia, fechaDeTurno } from "@/app/(app)/turnos/datos";
import { lineaTurno, ResumenTurnoDatos, TablaArqueos, TablaGastos, TablaMovimientos } from "@/app/(app)/turnos/Secciones";
import { obtenerContexto } from "@/lib/contexto";
import { fechaTexto } from "@/lib/formato";
import { puedeVerTurnos } from "@/lib/roles";
import { EncabezadoReporte } from "../../Encabezado";

export const dynamic = "force-dynamic";

/** Reporte de un turno para imprimir o guardar como PDF: fuera del menú para que salga limpio. */
export default async function ReporteTurno({ params }: { params: Promise<{ id: string }> }) {
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
    <main className="pagina">
      <EncabezadoReporte titulo={`Reporte de turno ${t.turno.tipo}`} sucursal={sucursal.nombre}
        detalle={`${fechaTexto(fecha)} · ${lineaTurno(t.turno, dia.persona)}`} generadoPor={perfil.nombre} />
      <section className="seccion"><h2>Resumen</h2><ResumenTurnoDatos t={t} /></section>
      <section className="seccion"><h2>Arqueos</h2><TablaArqueos arqueos={t.arqueos} persona={dia.persona} /></section>
      <section className="seccion"><h2>Movimientos ({t.movimientos.length})</h2><TablaMovimientos movimientos={t.movimientos} persona={dia.persona} caja={caja} /></section>
      <section className="seccion"><h2>Gastos ({t.gastos.length})</h2><TablaGastos gastos={t.gastos} persona={dia.persona} /></section>
    </main>
  );
}
