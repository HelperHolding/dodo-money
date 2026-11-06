import { Aviso } from "@/components/Aviso";
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
  return <><Aviso ok={sp.ok} error={sp.error} /><h1>Nueva campaña</h1><FormCampana campana={null} etiquetas={etiquetas} conteos={conteos} /></>;
}
