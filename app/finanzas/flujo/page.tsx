import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { leerCuentasBanca } from "@/app/banca/Banregio";
import { cargarFlujo } from "./datos";
import { TablaFlujo, TablaFlujoComparativo } from "./TablaFlujo";

type Filtros = { vista?: string; mes?: string; rfc?: string };

export default async function PaginaFlujo({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyMX();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes ?? "") && q.mes! <= hoy.slice(0, 7) ? q.mes! : hoy.slice(0, 7);
  const cuentas = await leerCuentasBanca(supabase);
  const empresas = [...new Map(cuentas.map((c) => [c.rfc, c.razon_social])).entries()];
  const rfc = empresas.some(([r]) => r === q.rfc) ? q.rfc! : null;
  const comparativo = q.vista === "comparativo";
  const d = await cargarFlujo(supabase, rfc, mes, hoy);
  const f = d.mes.flujo;
  const filtro = new URLSearchParams({ mes, ...(rfc ? { rfc } : {}) });
  const pestana = (activa: boolean, vista: string, texto: string) =>
    <Link aria-current={activa ? "page" : undefined} href={`/finanzas/flujo?${new URLSearchParams({ ...Object.fromEntries(filtro), vista })}`}>{texto}</Link>;
  const hasta = f.ultimaFecha && f.ultimaFecha < d.mes.hasta ? f.ultimaFecha : null;
  const avisos = [
    f.porConciliar.n > 0 && <>{f.porConciliar.n} {f.porConciliar.n === 1 ? "movimiento" : "movimientos"} por conciliar en el mes ({pesos(f.porConciliar.entradas)} de entradas, {pesos(-f.porConciliar.salidas)} de salidas). <Link href={`/banca?${new URLSearchParams({ vista: "conciliacion", desde: d.mes.desde, hasta: d.mes.hasta })}`}>Conciliar en Banca →</Link></>,
    f.diferencia !== 0 && <>El saldo final del banco difiere del calculado en {pesos(f.diferencia)}: hay huecos en los reportes importados.</>,
  ].filter(Boolean);

  return (
    <div className="panel-admin">
      <EncabezadoPagina
        titulo={<>Flujo de efectivo · {rfc ? empresas.find(([r]) => r === rfc)?.[1] : "Todas las razones sociales"}</>}
        descripcion={<>{comparativo ? `Comparativo ${mes.slice(0, 4)}` : d.mes.etiqueta}{hasta && !comparativo && ` · movimientos hasta el ${fechaTexto(hasta)}`}. Cifras reales del banco según la conciliación; % sobre ingresos operativos.</>}
        acciones={<a className="boton boton-secundario boton-compacto" href={`/reporte/flujo/excel?${filtro}`} download><Icono nombre="descargar" />Excel</a>}
      />
      <div className="barra-filtros">
        <nav className="segmentos" aria-label="Vista">{pestana(!comparativo, "mes", "Mes")}{pestana(comparativo, "comparativo", "Comparativo")}</nav>
        <form className="barra-filtros" method="get" aria-label="Mes y razón social">
          <input type="hidden" name="vista" value={comparativo ? "comparativo" : "mes"} />
          <label htmlFor="mes" className="solo-lector">Mes</label>
          <input id="mes" name="mes" type="month" defaultValue={mes} min={d.primerMes ?? undefined} max={hoy.slice(0, 7)} />
          <label htmlFor="rfc" className="solo-lector">Razón social</label>
          <select id="rfc" name="rfc" defaultValue={rfc ?? ""}>
            <option value="">Todas las razones sociales</option>
            {empresas.map(([r, n]) => <option key={r} value={r}>{n}</option>)}
          </select>
          <button className="boton boton-secundario boton-compacto" type="submit">Ver</button>
        </form>
      </div>
      {cuentas.length === 0 ? <EstadoVacio icono="banco" titulo="Todavía no hay movimientos bancarios" descripcion="Importa un reporte de Banregio en Banca para ver el flujo." /> : <>
        {avisos.map((a, i) => <p key={i} role="status" className="aviso">{a}</p>)}
        {comparativo ? <TablaFlujoComparativo columnas={d.columnas} total={d.total} mostrar={d.mostrarComparativo} /> : <TablaFlujo flujo={f} mostrar={d.mostrarMes} />}
      </>}
    </div>
  );
}
