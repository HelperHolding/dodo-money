import { notFound, redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { tituloCompromiso } from "@/lib/compras/compromisos";
import { leerCompromisos, leerOpciones, sucursalDe } from "../../datos";
import { FormCompromiso } from "../../FormCompromiso";

export default async function EditarCompromiso({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect(`/compras/pagos/compromisos/${id}`);
  const [[c], opciones] = await Promise.all([leerCompromisos(supabase, id), leerOpciones(supabase)]);
  if (!c) notFound();
  return <>
    <EncabezadoPagina titulo={`Editar ${tituloCompromiso(c, sucursalDe(c))}`} descripcion="Los cambios aplican a las fechas que aún no tienen factura." />
    <Aviso error={error} />
    <FormCompromiso c={c} {...opciones} hoy={hoyCalendarioMX()} />
  </>;
}
