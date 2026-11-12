import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { redirect } from "next/navigation";
import { FormCampana } from "../FormCampana";
import { leerEtiquetas } from "../datos";

export default async function Nueva({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCorreos(perfil.rol)) redirect("/correos");
  const sp = await searchParams, etiquetas = await leerEtiquetas(supabase);
  const conteos: Record<string, number> = {};
  for (const t of ["", ...etiquetas]) conteos[t] = Number((await supabase.rpc("correo_contar_destinatarios", { p_etiqueta: t || null })).data ?? 0);
  return <><Aviso ok={sp.ok} error={sp.error} /><EncabezadoPagina titulo="Nueva campaña" descripcion="Sube el HTML de Canva, revisa la vista previa y manda una prueba antes de programar." /><FormCampana campana={null} etiquetas={etiquetas} conteos={conteos} /></>;
}
