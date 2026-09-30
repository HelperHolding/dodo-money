import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { crearOrden } from "../acciones";

export default async function NuevaOrden({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/ordenes");
  const [{ data: proveedores }, { data: sucursales }] = await Promise.all([
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social")
      .returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  return (
    <>
      <div className="encabezado"><h1>Nueva cotización</h1><p>Después agregas los artículos. Al confirmarla se vuelve orden de compra.</p></div>
      <Aviso error={error} />
      <form action={crearOrden} className="seccion formulario">
        <div className="rejilla">
          <div className="campo">
            <label htmlFor="proveedor_id">Proveedor</label>
            <select id="proveedor_id" name="proveedor_id" required defaultValue="">
              <option value="" disabled>Elige…</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="sucursal_id">Para</label>
            <select id="sucursal_id" name="sucursal_id" defaultValue={sucursales?.[0]?.id ?? "oficina"}>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              <option value="oficina">Oficina</option>
            </select>
          </div>
        </div>
        <div className="campo"><label htmlFor="notas">Notas</label><textarea id="notas" name="notas" rows={2} /></div>
        <BotonEnviar>Crear cotización</BotonEnviar>
      </form>
    </>
  );
}
