import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { INICIO_PL } from "@/lib/finanzas/pl";
import { mesElegido, plConHistoria } from "./datos";
import { TablaPL } from "./TablaPL";

export default async function PaginaPL({ searchParams }: { searchParams: Promise<{ mes?: string; sucursal?: string }> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const mes = mesElegido(q.mes);
  const r = await plConHistoria(supabase, mes, q.sucursal);
  const filtro = new URLSearchParams({ mes, ...(r.suc ? { sucursal: r.suc.id } : {}) }).toString();

  return (
    <>
      <div className="encabezado">
        <h1>P&L · {r.titulo}</h1>
        <p>Montos sin IVA, criterio devengado. Meta: PL Base del modelo de Dodo (editable en Parámetros y metas).{!r.suc && " Elige una sucursal para ver de dónde sale cada renglón."}</p>
      </div>
      <form className="acciones" method="get">
        <label htmlFor="mes" className="etiqueta">Mes</label>
        <input id="mes" name="mes" type="month" defaultValue={mes} min={INICIO_PL} max={hoyMX().slice(0, 7)} />
        <label htmlFor="sucursal" className="etiqueta">Sucursal</label>
        <select id="sucursal" name="sucursal" defaultValue={r.suc?.id ?? ""}>
          <option value="">Consolidado</option>
          {r.datos.porSucursal.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="boton boton-secundario" type="submit">Ver</button>
        <Link className="boton boton-secundario" href={`/reporte/pl?${filtro}`} target="_blank">PDF</Link>
        <a className="boton boton-secundario" href={`/reporte/pl/excel?${filtro}`} download>Excel</a>
      </form>
      {r.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{r.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}

      <TablaPL r={r} oficina={r.suc ? null : r.datos.oficina} />
    </>
  );
}
