import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resumir } from "@/lib/finanzas/capex";
import { filaCapex } from "./datos";
import { TarjetaCapex } from "./TarjetaCapex";

/** Resumen CAPEX en la página de una apertura, con enlace al detalle de Finanzas. Solo para quien ve Finanzas. */
export async function ResumenCapexApertura({ db, proyectoId }: { db: SupabaseClient; proyectoId: string }) {
  const { data, error } = await db.from("capex_resumen").select("*").eq("proyecto_id", proyectoId).returns<Record<string, unknown>[]>();
  const href = `/finanzas/capex/${proyectoId}`;
  return (
    <section className="seccion" aria-labelledby="t-capex-apertura">
      <h2 id="t-capex-apertura">CAPEX de la apertura</h2>
      {error
        ? <p className="aviso aviso-error">No se pudo cargar el CAPEX. <Link href={href}>Abrir en Finanzas</Link></p>
        : <div className="rejilla"><TarjetaCapex titulo="Presupuesto aprobado vs real" href={href} r={resumir((data ?? []).map(filaCapex))}
            detalle={<small className="saldo-nota"><Link href={href}>Ver detalle por categoría y documentos</Link></small>} /></div>}
    </section>
  );
}
