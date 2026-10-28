import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerOpciones } from "../datos";
import { FormCompromiso } from "../FormCompromiso";

export default async function NuevoCompromiso({ searchParams }: { searchParams: Promise<{ error?: string; sucursal?: string }> }) {
  const { error, sucursal } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/pagos/compromisos");
  const opciones = await leerOpciones(supabase);
  return <>
    <EncabezadoPagina titulo="Nuevo compromiso" descripcion="Algo que se paga sí o sí cada cierto tiempo: renta, fumigación, basura, trampas de grasa." />
    <Aviso error={error} />
    <FormCompromiso {...opciones} hoy={hoyCalendarioMX()} sucursalInicial={sucursal} />
  </>;
}
