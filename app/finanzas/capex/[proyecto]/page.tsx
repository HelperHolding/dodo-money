import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos } from "@/lib/formato";
import { puedeEditarFinanzas } from "@/lib/roles";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { CATEGORIAS_CAPEX, nombreCategoriaCapex, resumir } from "@/lib/finanzas/capex";
import { cargarDetalleCapex } from "../datos";
import { TarjetaCapex } from "../TarjetaCapex";
import { aprobarPresupuesto } from "../acciones";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleCapex({ params, searchParams }: { params: Promise<{ proyecto: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ proyecto: id }, { ok, error }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { supabase, perfil } = await obtenerPerfil();
  const d = await cargarDetalleCapex(supabase, id);
  if (!d) notFound();
  const vigente = d.revisiones[0]?.revision ?? 0;
  const actual = new Map(d.revisiones.filter((r) => r.revision === vigente).map((r) => [r.categoria, r.monto]));
  const categorias = CATEGORIAS_CAPEX.filter((c) => d.filas.some((f) => f.categoria === c.clave && ((f.presupuesto ?? 0) > 0 || f.comprometido || f.facturado)));
  const revisiones = [...new Set(d.revisiones.map((r) => r.revision))];
  const ruta = (x: { tipo: "orden" | "factura"; documento_id: string }) => `/compras/${x.tipo === "orden" ? "ordenes" : "facturas"}/${x.documento_id}`;
  return (
    <>
      <EncabezadoPagina titulo={`CAPEX · ${d.proyecto.sucursal}`} descripcion={<><Link href="/finanzas/capex">← Todas las aperturas</Link> · Montos sin IVA salvo donde dice con IVA.</>} />
      <Aviso ok={ok} error={error} />
      <section className="seccion rejilla"><TarjetaCapex titulo="Total de la apertura" r={resumir(d.filas)} /></section>
      {d.sinCategorizar.length > 0 && <section className="seccion" aria-labelledby="t-sin"><h2 id="t-sin">Sin categorizar · {d.sinCategorizar.length}</h2>
        <p className="aviso aviso-error">Estos items de la apertura tienen orden o factura que todavía no está asignada como CAPEX; no cuentan en el reporte.</p>
        <ul>{d.sinCategorizar.map((s) => <li key={s.id}>{s.nombre} · <Link href={ruta(s)}>{s.tipo === "orden" ? "Ver orden" : "Ver factura"}</Link></li>)}</ul></section>}
      <section className="seccion"><h2>Por categoría</h2>
        <div className="rejilla">{categorias.map((c) => {
          const filas = d.filas.filter((f) => f.categoria === c.clave);
          const docs = d.documentos.filter((x) => x.categoria === c.clave);
          return <TarjetaCapex key={c.clave} titulo={c.nombre} r={resumir(filas)} detalle={<>
            {vigente > 0 && (actual.get(c.clave) ?? 0) === 0 && <small className="saldo-nota">Sin presupuesto en esta categoría</small>}
            <details><summary>Documentos ({docs.length})</summary><ul>{docs.map((x) => <li key={x.id}><Link href={ruta(x)}>{x.folio}</Link> · {x.proveedor} · {x.egreso ? "−" : ""}{pesos(x.monto)} · {x.estado}</li>)}</ul></details>
          </>} />;
        })}</div>
        {categorias.length === 0 && <p className="vacio">Todavía no hay presupuesto aprobado ni documentos asignados.</p>}
      </section>
      <section className="seccion" aria-labelledby="t-presupuesto"><h2 id="t-presupuesto">Presupuesto</h2>
        {vigente === 0 ? <p>Sin presupuesto aprobado.</p> : <p>Revisión vigente: {vigente}.</p>}
        {revisiones.map((rev) => { const filas = d.revisiones.filter((r) => r.revision === rev); const r0 = filas[0]!;
          const previa = new Map(d.revisiones.filter((r) => r.revision === rev - 1).map((r) => [r.categoria, r.monto]));
          return <details key={rev}><summary>Revisión {rev} · {pesos(filas.reduce((a, r) => a + r.monto, 0))} · {r0.aprobador} · {new Date(r0.aprobado_en).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</summary>
            <p>{r0.motivo}</p><ul>{filas.filter((r) => r.monto > 0 || (previa.get(r.categoria) ?? 0) > 0).map((r) => { const dif = rev > 1 ? r.monto - (previa.get(r.categoria) ?? 0) : 0;
              return <li key={r.categoria}>{nombreCategoriaCapex(r.categoria)}: {pesos(r.monto)}{dif !== 0 && ` (${dif > 0 ? "+" : "−"}${pesos(Math.abs(dif))})`}</li>; })}</ul></details>; })}
        {puedeEditarFinanzas(perfil.rol) && <form action={aprobarPresupuesto} className="formulario">
          <h3>{vigente === 0 ? "Aprobar presupuesto" : "Nueva revisión"}</h3>
          <input type="hidden" name="proyecto" value={id} /><input type="hidden" name="revision" value={vigente} />
          {CATEGORIAS_CAPEX.map((c) => <label key={c.clave}>{c.nombre} (sin IVA)<input name={`monto_${c.clave}`} inputMode="decimal" defaultValue={actual.get(c.clave) || ""} /></label>)}
          <label>Motivo<input name="motivo" required minLength={5} maxLength={2000} placeholder={vigente === 0 ? "Presupuesto inicial aprobado" : "Qué cambió y por qué"} /></label>
          <button className="boton">Aprobar</button>
        </form>}
      </section>
    </>
  );
}
