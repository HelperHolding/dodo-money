import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX } from "@/lib/formato";
import { elegirPeriodo, etiquetaSemana, paramsPeriodo, semanasDesde } from "@/lib/finanzas/periodo";
import { INICIO_FECHA, INICIO_PL } from "@/lib/finanzas/pl";
import { plConHistoria } from "./datos";
import { TablaPL } from "./TablaPL";

type Filtros = { periodo?: string; mes?: string; semana?: string; sucursal?: string };

export default async function PaginaPL({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyMX();
  const p = elegirPeriodo(q, hoy, INICIO_FECHA);
  const r = await plConHistoria(supabase, p, q.sucursal);
  const suc: Record<string, string> = r.suc ? { sucursal: r.suc.id } : {};
  const filtro = new URLSearchParams({ ...paramsPeriodo(p), ...suc }).toString();
  const enCurso = !p.vacio && p.hasta < p.finNominal;

  return (
    <>
      <div className="encabezado">
        <h1>P&L · {r.titulo}</h1>
        <p>
          {p.titulo}{enCurso && ` · hasta el ${fechaTexto(p.hasta)}`}. Montos sin IVA, criterio devengado. Meta: PL Base del modelo de Dodo.
          {!r.suc && " Elige una sucursal para ver de dónde sale cada renglón."}
        </p>
      </div>
      <nav className="acciones" aria-label="Periodo">
        <Link className={p.tipo === "mes" ? "boton" : "boton boton-secundario"} aria-current={p.tipo === "mes" ? "page" : undefined}
          href={`/finanzas?${new URLSearchParams({ periodo: "mes", ...suc })}`}>Mes</Link>
        <Link className={p.tipo === "semana" ? "boton" : "boton boton-secundario"} aria-current={p.tipo === "semana" ? "page" : undefined}
          href={`/finanzas?${new URLSearchParams({ periodo: "semana", ...suc })}`}>Semana</Link>
      </nav>
      <form className="acciones" method="get">
        <input type="hidden" name="periodo" value={p.tipo} />
        {p.tipo === "mes" ? (
          <>
            <label htmlFor="mes" className="etiqueta">Mes</label>
            <input id="mes" name="mes" type="month" defaultValue={p.clave} min={INICIO_PL} max={hoy.slice(0, 7)} />
          </>
        ) : (
          <>
            <label htmlFor="semana" className="etiqueta">Semana</label>
            <select id="semana" name="semana" defaultValue={p.clave}>
              {semanasDesde(INICIO_FECHA, hoy).map((s) => <option key={s} value={s}>{etiquetaSemana(s)}</option>)}
            </select>
          </>
        )}
        <label htmlFor="sucursal" className="etiqueta">Sucursal</label>
        <select id="sucursal" name="sucursal" defaultValue={r.suc?.id ?? ""}>
          <option value="">Consolidado</option>
          {r.datos.porSucursal.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="boton boton-secundario" type="submit">Ver</button>
        <Link className="boton boton-secundario" href={`/reporte/pl?${filtro}`} target="_blank">PDF</Link>
        <a className="boton boton-secundario" href={`/reporte/pl/excel?${filtro}`} download>Excel</a>
      </form>
      {p.tipo === "semana" && (
        <p className="saldo-nota">Lo que se registra por mes (nómina, renta, servicios, facturas, oficina) se reparte por días; si llega una factura de ese mes, esta semana se ajusta.</p>
      )}
      {p.vacio ? (
        <p className="vacio">{p.tipo === "semana" ? "La semana apenas empieza: todavía no hay días cerrados." : "El mes apenas empieza: todavía no hay días cerrados."}</p>
      ) : (
        <>
          {r.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{r.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          <TablaPL r={r} oficina={r.suc ? null : r.datos.oficina} columnas={r.columnas} />
        </>
      )}
    </>
  );
}
