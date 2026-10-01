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
      <div className="encabezado"><h1>Subir facturas</h1><p>Se leen del XML: folio fiscal, proveedor, montos, impuestos y conceptos.</p></div>
      {!e ? (
        <p className="aviso aviso-error">Antes configura el RFC de la empresa. <Link href="/compras/facturas/empresa">Datos de la empresa</Link></p>
      ) : <FormSubir />}
    </>
  );
}
