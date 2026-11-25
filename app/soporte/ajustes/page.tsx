import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, fechaTexto, hora } from "@/lib/formato";
import { clave, esSoporte } from "@/lib/soporte";
import { guardarAjustes } from "../acciones";
import { leerAjustes, leerResponsables } from "../datos";

export default async function AjustesSoporte({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const avisos = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!esSoporte(perfil.rol)) notFound();
  let datos, responsables;
  try { [datos, responsables] = await Promise.all([leerAjustes(supabase), leerResponsables(supabase)]); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar los ajustes del Help Desk.</p>; }
  const { ajustes, fallidos, pendientes } = datos;
  return <>
    <EncabezadoPagina titulo="Ajustes del Help Desk" info="A quién se asignan los tickets nuevos y a qué correos llegan los avisos. Los correos salen por n8n cada minuto." />
    <Aviso {...avisos} />
    <section className="seccion">
      <form action={guardarAjustes} className="formulario">
        <div className="campo"><label htmlFor="responsable">Responsable de tickets nuevos</label>
          <select id="responsable" name="responsable" defaultValue={ajustes.responsable_default ?? ""}><option value="">Sin asignar</option>{responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></div>
        <div className="campo"><label htmlFor="correos">Correos que reciben avisos (uno por línea, máximo 10)</label>
          <textarea id="correos" name="correos" rows={3} defaultValue={ajustes.correos.join("\n")} /></div>
        <label className="campo"><input type="checkbox" name="avisar_nuevos" value="1" defaultChecked={ajustes.avisar_nuevos} /> Avisar cada ticket nuevo</label>
        <label className="campo"><input type="checkbox" name="avisar_comentarios" value="1" defaultChecked={ajustes.avisar_comentarios} /> Avisar cuando quien reporta comenta</label>
        <label className="campo"><input type="checkbox" name="agente_activo" value="1" defaultChecked={ajustes.agente_activo} /> Agente activo: atiende cada ticket nuevo y te escala lo que necesita</label>
        <label className="campo"><input type="checkbox" name="resumen_diario" value="1" defaultChecked={ajustes.resumen_diario} /> Resumen diario (8 am) de lo que resolvió el agente</label>
        <BotonEnviar>Guardar ajustes</BotonEnviar>
      </form>
    </section>
    <section className="seccion"><h2>Envíos</h2>
      <p>{pendientes ? `${pendientes} aviso(s) esperando a n8n.` : "No hay avisos en espera."}</p>
      {fallidos.length > 0 && <ol className="hilo-tarea">
        {fallidos.map((f) => <li key={f.id}><strong>{f.soporte_tickets ? clave(f.soporte_tickets.numero) : "Ticket"}</strong> · {f.evento === "nuevo" ? "ticket nuevo" : f.evento === "escalado" ? "escalado del agente" : "comentario"} a {f.para}: {f.ultimo_error ?? "sin detalle"}
          <small> · {fechaTexto(fechaMX(f.creado_en))} {hora(f.creado_en)}</small></li>)}
      </ol>}
    </section>
  </>;
}
