import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { FormSubir } from "./FormSubir";

export default async function Subir() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/facturas");
  const { data: e } = await supabase.from("empresa").select("rfc").maybeSingle<{ rfc: string }>();
  return (
    <>
      <EncabezadoPagina titulo="Subir facturas" descripcion="El RFC receptor del XML determina la razón social del grupo. Se leen folio fiscal, proveedor, montos, impuestos y conceptos." />
      <p><Link href="/compras/razones-sociales">Razones sociales autorizadas</Link></p>{!e ? (
        <p className="aviso aviso-error">Antes configura el RFC de la empresa. <Link href="/compras/facturas/empresa">Datos de la empresa</Link></p>
      ) : <FormSubir />}
    </>
  );
}
