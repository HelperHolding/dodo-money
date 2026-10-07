import Link from "next/link";
import { Marco } from "@/components/Marco";
import { BotonEnviar } from "@/components/BotonEnviar";
import { verSucursal } from "@/app/corporativo/actions";
import { obtenerContexto } from "@/lib/contexto";
import { puedeCambiarSucursal } from "@/lib/roles";
import { hora } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { supabase, perfil, sucursal, turno, soloLectura } = await obtenerContexto();
  const cambia = puedeCambiarSucursal(perfil.rol);
  const { data: sucursales } = cambia
    ? await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>()
    : { data: null };
  return (
    <Marco
      perfil={perfil}
      titulo={sucursal.nombre}
      detalle={turno ? `Turno ${turno.tipo} abierto desde las ${hora(turno.abierto_en)}` : "Sin turno abierto"}
      aviso={soloLectura ? (
        <p className="franja-lectura">
          Viendo {sucursal.nombre} · Solo lectura · <Link href="/corporativo">Volver a corporativo</Link>
        </p>
      ) : cambia && (sucursales ?? []).length > 1 && (
        <form action={verSucursal} className="franja-lectura franja-sucursal">
          <label htmlFor="sucursal_activa">Operando en</label>
          <select id="sucursal_activa" name="sucursal_id" defaultValue={sucursal.id}>
            {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <BotonEnviar className="boton boton-secundario" pendiente="Cambiando…">Cambiar</BotonEnviar>
          <Link href="/corporativo">Vista general</Link>
        </form>
      )}
    >
      {children}
    </Marco>
  );
}
