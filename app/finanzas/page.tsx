import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX } from "@/lib/formato";
import { elegirPeriodo, etiquetaSemana, paramsPeriodo, semanasDesde } from "@/lib/finanzas/periodo";
import { INICIO_FECHA, INICIO_PL } from "@/lib/finanzas/pl";
import { comparativoPL, plConHistoria } from "./datos";
import { TablaComparativo } from "./TablaComparativo";
import { TablaPL } from "./TablaPL";

type Filtros = { periodo?: string; mes?: string; semana?: string; sucursal?: string; vista?: string };

export default async function PaginaPL({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyMX();
  const p = elegirPeriodo(q, hoy, INICIO_FECHA);
  const comparativo = q.vista === "comparativo";
  const meta = comparativo ? null : await plConHistoria(supabase, p, q.sucursal);
  const comp = comparativo ? await comparativoPL(supabase, p, q.sucursal) : null;
  const titulo = meta?.titulo ?? comp?.titulo ?? "Consolidado";
  const sucId = meta ? meta.suc?.id : comp?.suc?.id;
  const sucursales = meta ? meta.datos.porSucursal : comp?.sucursales ?? [];
  const suc: Record<string, string> = sucId ? { sucursal: sucId } : {};
  const vista: Record<string, string> = comparativo ? { vista: "comparativo" } : {};
  const filtro = new URLSearchParams({ ...paramsPeriodo(p), ...suc, ...vista }).toString();
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const pestana = (activa: boolean, href: string, texto: string) => (
    <Link className={activa ? "boton" : "boton boton-secundario"} aria-current={activa ? "page" : undefined} href={href}>{texto}</Link>
  );

  return (
    <>
      <div className="encabezado">
        <h1>P&L · {titulo}</h1>
        <p>
          {comp ? comp.periodoTitulo : <>{p.titulo}{enCurso && ` · hasta el ${fechaTexto(p.hasta)}`}</>}. Venta bruta antes de descuentos y con IVA; resultado sin IVA, criterio devengado.
          {meta && " Meta: PL Base del modelo de Dodo."}{meta && !meta.suc && " Elige una sucursal para ver de dónde sale cada renglón."}
        </p>
      </div>
      <p className="saldo-nota">El desglose Dodo IS / POS y Rappi corresponde a la fuente de importación. Los subtotales por fuente ya están incluidos en los totales. Los porcentajes son sobre la venta neta total.</p>
      <p><Link href="/ventas/conciliacion">Revisar diferencias y conciliaciones de Dodo IS →</Link></p>
      <p className="saldo-nota">Merma: bajas de productos terminados. Los insumos siguen pendientes de separar del ajuste incluido en el BOM.</p>
      <nav className="acciones" aria-label="Periodo y vista">
        {pestana(p.tipo === "mes", `/finanzas?${new URLSearchParams({ periodo: "mes", ...suc, ...vista })}`, "Mes")}
        {pestana(p.tipo === "semana", `/finanzas?${new URLSearchParams({ periodo: "semana", ...suc, ...vista })}`, "Semana")}
        {pestana(!comparativo, `/finanzas?${new URLSearchParams({ ...paramsPeriodo(p), ...suc })}`, "Contra meta")}
        {pestana(comparativo, `/finanzas?${new URLSearchParams({ ...paramsPeriodo(p), ...suc, vista: "comparativo" })}`, "Comparativo")}
      </nav>
      <form className="acciones" method="get">
        <input type="hidden" name="periodo" value={p.tipo} />
        {comparativo && <input type="hidden" name="vista" value="comparativo" />}
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
        <select id="sucursal" name="sucursal" defaultValue={sucId ?? ""}>
          <option value="">Consolidado</option>
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="boton boton-secundario" type="submit">Ver</button>
        <Link className="boton boton-secundario" href={`/reporte/pl?${filtro}`} target="_blank">PDF</Link>
        <a className="boton boton-secundario" href={`/reporte/pl/excel?${filtro}`} download>Excel</a>
      </form>
      {p.tipo === "semana" && (
        <p className="saldo-nota">Lo que se registra por mes (nómina, renta, servicios, facturas, oficina) se reparte por días; si llega una factura de ese mes, la semana se ajusta.</p>
      )}
      {comp ? (
        comp.columnas.length === 0
          ? <p className="vacio">Todavía no hay días cerrados en este periodo.</p>
          : <TablaComparativo columnas={comp.columnas} total={comp.total} />
      ) : meta && p.vacio ? (
        <p className="vacio">{p.tipo === "semana" ? "La semana apenas empieza: todavía no hay días cerrados." : "El mes apenas empieza: todavía no hay días cerrados."}</p>
      ) : meta && (
        <>
          {meta.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{meta.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          <TablaPL r={meta} columnas={meta.columnas} />
        </>
      )}
    </>
  );
}
