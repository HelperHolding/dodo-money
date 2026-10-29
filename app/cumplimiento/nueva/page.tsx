import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerOpciones } from "../datos";
import { FormObligacion } from "../FormObligacion";

export default async function NuevaObligacion({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/cumplimiento");
  return <>
    <EncabezadoPagina titulo="Nueva obligación" descripcion="Permisos, licencias, protección civil, extintores, trámites fiscales y seguros." />
    <Aviso error={error} />
    <FormObligacion {...await leerOpciones(supabase)} hoy={hoyCalendarioMX()} />
  </>;
}
