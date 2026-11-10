import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { nombreCategoriaCapex, resumir, type Semaforo } from "@/lib/finanzas/capex";
import { cargarResumenCapex } from "./datos";
import { TarjetaCapex } from "./TarjetaCapex";

export const dynamic = "force-dynamic";
const FILTROS: { valor: Semaforo | ""; texto: string }[] = [{ valor: "", texto: "Todas" }, { valor: "rojo", texto: "Sobre presupuesto" }, { valor: "ambar", texto: "Cerca del límite" }, { valor: "verde", texto: "En presupuesto" }, { valor: "gris", texto: "Sin presupuesto" }];

export default async function PaginaCapex({ searchParams }: { searchParams: Promise<{ semaforo?: string }> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const d = await cargarResumenCapex(supabase);
  const total = resumir(d.filas);
  const tarjetas = d.proyectos.map((p) => ({ p, r: resumir(d.filas.filter((f) => f.proyecto_id === p.id)) }))
    .filter((t) => !q.semaforo || t.r.semaforo === q.semaforo);
  const historicas = [...new Set(d.historico.map((h) => h.sucursal_id))].map((s) => {
    const filas = d.historico.filter((h) => h.sucursal_id === s);
    return { sucursal: filas[0]!.sucursal, total: filas.reduce((a, h) => a + Math.round(h.monto * 100), 0) / 100, filas };
  });
  return (
    <>
      <EncabezadoPagina titulo="CAPEX de aperturas" descripcion="Presupuesto aprobado contra lo comprometido, facturado y pagado. Montos sin IVA salvo donde dice con IVA." />
      <section className="seccion rejilla" aria-label="Totales">
        <div className="saldo"><span>Presupuesto aprobado</span><span className="saldo-monto">{pesos(total.presupuesto ?? 0)}</span></div>
        <div className="saldo"><span>Ejercido</span><span className="saldo-monto">{pesos(total.ejercido)}</span><small className="saldo-nota">Comprometido + facturado</small></div>
        <div className="saldo"><span>Pagado con IVA</span><span className="saldo-monto">{pesos(total.pagado_con_iva)}</span></div>
        <div className="saldo"><span>Por pagar con IVA</span><span className="saldo-monto">{pesos(total.por_pagar_con_iva)}</span></div>
      </section>
      <form className="seccion" method="get"><label>Semáforo<select name="semaforo" defaultValue={q.semaforo ?? ""}>{FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}</select></label><button className="boton">Filtrar</button></form>
      <section className="seccion"><h2>Aperturas en curso · {tarjetas.length}</h2>
        {tarjetas.length === 0 ? <EstadoVacio titulo="Sin aperturas en este filtro" descripcion="Cambia el semáforo o registra una apertura en Aperturas." /> :
          <div className="rejilla">{tarjetas.map(({ p, r }) => <TarjetaCapex key={p.id} titulo={p.sucursal} href={`/finanzas/capex/${p.id}`} r={r}
            detalle={<small className="saldo-nota">{p.responsable} · {fechaTexto(p.objetivo_desde)} a {fechaTexto(p.objetivo_hasta)}</small>} />)}</div>}
      </section>
      {historicas.length > 0 && <section className="seccion"><h2>Inversión histórica · sin presupuesto</h2>
        <p>Importe de la fuente contable importada, sin desglose de IVA. Excluye gastos preoperativos y depósitos.</p>
        <div className="rejilla">{historicas.map((h) => <article key={h.sucursal} className="saldo"><span>{h.sucursal}</span><span className="saldo-monto">{pesos(h.total)}</span>
          <ul className="saldo-nota">{h.filas.map((f) => <li key={f.categoria}>{nombreCategoriaCapex(f.categoria)}: {pesos(f.monto)}</li>)}</ul></article>)}</div>
      </section>}
    </>
  );
}
