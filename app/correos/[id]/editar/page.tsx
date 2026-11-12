import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { NOMBRE_ESTADO } from "@/lib/correos/tipos";
import { TONO_ESTADO } from "@/lib/correos/presentacion";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { notFound, redirect } from "next/navigation";
import { cambiarEstado } from "../../acciones";
import { FormCampana } from "../../FormCampana";
import { leerCampana, leerEtiquetas } from "../../datos";
import styles from "../../correos.module.css";

export default async function Editar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  const { id } = await params;
  if (!puedeEditarCorreos(perfil.rol)) redirect(`/correos/${id}`);
  const campana = await leerCampana(supabase, id);
  if (!campana) notFound();
  if (campana.estado !== "borrador" && campana.estado !== "programada") redirect(`/correos/${id}`);
  const sp = await searchParams, etiquetas = await leerEtiquetas(supabase);
  const conteos: Record<string, number> = {};
  for (const t of ["", ...etiquetas]) conteos[t] = Number((await supabase.rpc("correo_contar_destinatarios", { p_etiqueta: t || null })).data ?? 0);
  return <>
    <Aviso ok={sp.ok} error={sp.error} />
    <EncabezadoPagina titulo={campana.nombre} descripcion={<span className={styles.resumen}><span className="estado" data-tono={TONO_ESTADO[campana.estado]}>{NOMBRE_ESTADO[campana.estado]}</span><span>{campana.asunto}</span></span>} />
    {campana.estado === "programada" && <div className={`aviso aviso-info ${styles.aviso}`}>
      <p>Esta campaña está programada. Para cambiar el plan, regrésala a borrador o cancélala.</p>
      {(["borrador", "cancelar"] as const).map((accion) => <form key={accion} action={cambiarEstado}>
        <input type="hidden" name="id" value={campana.id} /><input type="hidden" name="accion" value={accion} />
        <input type="hidden" name="volver_a" value={`/correos/${campana.id}/editar`} />
        <button type="submit" className={accion === "borrador" ? "boton" : "boton boton-alerta"}>{accion === "borrador" ? "Regresar a borrador" : "Cancelar campaña"}</button>
      </form>)}
    </div>}
    <FormCampana key={`${campana.id}:${campana.nombre}:${campana.asunto}:${campana.etiqueta}:${campana.html.length}`} campana={campana} etiquetas={etiquetas} conteos={conteos} />
  </>;
}
