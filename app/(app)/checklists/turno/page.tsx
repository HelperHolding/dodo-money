import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { diaSemanaISO } from "@/lib/limpiezaProfunda";
import type { Checklist, PuntoChecklist, RegistroChecklist } from "@/lib/tipos";
import { COLUMNAS, filasListas } from "@/lib/zonas";
import { Revisar } from "../Revisar";
import { TarjetasListas } from "../TarjetasListas";
import { FormLista } from "./FormLista";

export default async function ListasDelTurno({
  searchParams,
}: { searchParams: Promise<{ ok?: string; error?: string; lista?: string; momento?: string }> }) {
  const { ok, error, lista, momento } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const dia = diaSemanaISO(fecha);

  const [{ data: checklists }, { data: puntos }, { data: registros }, { data: nombres }] = await Promise.all([
    supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden")
      .eq("tipo", "lista").order("orden").returns<Checklist[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id, orden, texto, detalle_por_hora, momento, dia_semana")
      .neq("momento", "hora").order("orden").returns<PuntoChecklist[]>(),
    supabase.from("registros_checklist")
      .select("id, checklist_id, fecha, momento, hora, empleado, registrado_por, creado_en, revisado_por, revisado_en, registro_respuestas(punto_id, cumple, comentario)")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).neq("momento", "hora").returns<RegistroChecklist[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const filas = filasListas(checklists ?? [], puntos ?? [], registros ?? [], dia);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));

  const elegida = (checklists ?? []).find((c) => c.clave === lista);
  const columna = COLUMNAS.find((c) => c.momento === momento);
  const puntosElegidos = elegida && columna
    ? (puntos ?? []).filter((p) => p.checklist_id === elegida.id && p.momento === columna.momento
        && (columna.momento !== "semanal" || p.dia_semana === dia))
    : [];
  const registro = elegida && columna ? (registros ?? []).find((r) => r.checklist_id === elegida.id && r.momento === columna.momento) : undefined;
  const puedeRegistrar = !!elegida && !soloLectura && elegida.roles.includes(perfil.rol);
  const textoPunto = new Map((puntos ?? []).map((p) => [p.id, p.texto]));

  return (
    <>
      <EncabezadoPagina titulo="Listas del turno" descripcion="Apertura, cambio de turno, durante el turno, cierre y tareas del día. Toca una casilla para llenarla o verla." />
      <Aviso ok={ok} error={error} />

      {elegida && columna && (
        <section className="seccion" aria-labelledby="t-lista">
          <div className="acciones">
            <h2 id="t-lista">{elegida.nombre} · {columna.titulo}</h2>
            <Link href="/checklists/turno">Volver a las listas</Link>
          </div>
          {registro ? (
            <>
              <p className="saldo-nota">Hecha por {registro.empleado} · {hora(registro.creado_en)} · sesión de {persona.get(registro.registrado_por)}</p>
              <ul className="fallas">
                {registro.registro_respuestas.filter((x) => !x.cumple).map((x) => (
                  <li key={x.punto_id}><strong>{textoPunto.get(x.punto_id)}</strong> {x.comentario}</li>
                ))}
              </ul>
              {registro.registro_respuestas.every((x) => x.cumple) && <span className="estado estado-confirmado">Todo cumple</span>}
              <Revisar tipo="checklist" id={registro.id} volver={`/checklists/turno?lista=${elegida.clave}&momento=${columna.momento}`}
                revisadoPor={registro.revisado_por ? persona.get(registro.revisado_por) : null} revisadoEn={registro.revisado_en}
                puede={puedeSupervisar(perfil.rol)} />
            </>
          ) : !puntosElegidos.length ? <p className="vacio">Esta lista no tiene nada que hacer en este momento hoy.</p>
            : puedeRegistrar ? <FormLista key={`${elegida.id}|${columna.momento}`} checklistId={elegida.id} momento={columna.momento} puntos={puntosElegidos} />
            : <p className="vacio">{soloLectura ? "Corporativo solo puede consultar." : "Esta lista la registra el encargado o el gerente."}</p>}
        </section>
      )}

      <section className="seccion" aria-labelledby="t-listas">
        <h2 id="t-listas">Hoy</h2>
        <TarjetasListas filas={filas} enlace />
      </section>
    </>
  );
}
