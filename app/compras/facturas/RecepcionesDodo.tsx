import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaTexto, pesos, precioUnitario } from "@/lib/formato";

type Fila = { id: string; material: string; cantidad: number; unidad: string; precio: number; fecha: string; importe_sin_iva: number | null; sucursales: { nombre: string } | null };

/** Recepciones de Dodo IS ligadas a la factura por su folio: lo recibido frente al subtotal facturado (informativo). */
export async function RecepcionesDodo({ supabase, facturaId, subtotal }: { supabase: SupabaseClient; facturaId: string; subtotal: number }) {
  const { data } = await supabase.from("recepciones_dodo").select("id, material, cantidad, unidad, precio, fecha, importe_sin_iva, sucursales(nombre)")
    .eq("factura_id", facturaId).order("fecha").order("material").returns<Fila[]>();
  const filas = data ?? [];
  if (!filas.length) return null;
  const recibido = filas.reduce((t, f) => t + Number(f.importe_sin_iva ?? Number(f.cantidad) * Number(f.precio)), 0);
  const diferencia = Math.round((recibido - subtotal) * 100) / 100;
  return (
    <section className="seccion" aria-labelledby="t-recepciones-dodo">
      <h2 id="t-recepciones-dodo">Recepciones de Dodo IS · {filas.length}</h2>
      <p className={Math.abs(diferencia) > 1 ? "aviso aviso-error" : "aviso aviso-ok"}>
        Recibido sin IVA {pesos(recibido)} · facturado {pesos(subtotal)}{Math.abs(diferencia) > 1 ? ` · diferencia ${pesos(diferencia)}` : " · cuadra"}
      </p>
      <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
        {filas.map((f) => (
          <li key={f.id} className="fila">
            <div className="fila-nombre"><strong>{f.material}</strong><small>{fechaTexto(f.fecha)} · {f.sucursales?.nombre}</small></div>
            <div className="fila-datos"><span>{f.cantidad} {f.unidad} · {precioUnitario(f.precio)}</span><span>{pesos(Number(f.importe_sin_iva ?? 0))}</span></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
