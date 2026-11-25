import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { rutaInterna, seccionDeRuta } from "@/lib/soporte";
import { FormTicket } from "./FormTicket";

export const maxDuration = 60;

export default async function NuevoTicket({ searchParams }: { searchParams: Promise<{ desde?: string; ok?: string; error?: string }> }) {
  const p = await searchParams;
  const desde = rutaInterna(p.desde ?? "");
  return <>
    <EncabezadoPagina titulo="Reportar" info="Cuéntanos qué falló o qué te gustaría que hiciera el sistema. Te respondemos dentro del ticket." />
    <Link href="/soporte">Ver mis tickets</Link>
    <Aviso ok={p.ok} error={p.error} />
    <FormTicket desde={desde} seccion={seccionDeRuta(desde)} />
  </>;
}
