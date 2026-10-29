import { notFound, redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerObligaciones, leerOpciones } from "../../datos";
import { FormObligacion } from "../../FormObligacion";

export default async function EditarObligacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect(`/cumplimiento/${id}`);
  const [[o], opciones] = await Promise.all([leerObligaciones(supabase, id), leerOpciones(supabase)]);
  if (!o) notFound();
  return <>
    <EncabezadoPagina titulo={`Editar · ${o.nombre}`} descripcion="Los cambios aplican a las fechas que aún no se trabajan." />
    <Aviso error={error} />
    <FormObligacion o={o} {...opciones} hoy={hoyCalendarioMX()} />
  </>;
}
