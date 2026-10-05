import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { FormProveedor } from "../../FormProveedor";

export default async function NuevoProveedor({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras");
  const { data: sucursales } = await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>();
  return (
    <>
      <div className="encabezado"><h1>Nuevo proveedor</h1><p>El RFC y el régimen fiscal sirven para reconocer sus facturas.</p></div>
      <Aviso error={error} />
      <FormProveedor sucursales={sucursales ?? []} />
    </>
  );
}
