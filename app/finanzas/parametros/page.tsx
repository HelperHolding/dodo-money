import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX, hoyMX, pesos } from "@/lib/formato";
import { NOMBRE_PARAMETRO, valorVigente, type ClaveParametro, type Parametro } from "@/lib/finanzas/parametros";
import { RENGLONES } from "@/lib/finanzas/pl";
import { puedeEditarFinanzas } from "@/lib/roles";
import { guardarMeta, guardarMetasVenta, guardarParametro } from "./acciones";

const NOMBRE_TIPO = { pct: "% de la venta neta", monto: "Monto fijo al mes", pct_rappi: "% de la venta Rappi con IVA", plantilla: "Costo de la plantilla" } as const;

export default async function Parametros({ searchParams }: { searchParams: Promise<{ sucursal?: string; mes_meta?: string; ok?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarFinanzas(perfil.rol);
  const hoy = hoyMX();
  const mesMeta = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes_meta ?? "") ? q.mes_meta! : hoyCalendarioMX().slice(0, 7);
  const mesAnterior = new Date(Date.parse(`${mesMeta}-01T00:00:00Z`) - 86_400_000).toISOString().slice(0, 7);
  const [{ data: params }, { data: sucursales }, { data: metas }, { data: metasVentaDatos }] = await Promise.all([
    supabase.from("pl_parametros").select("clave, valor, vigente_desde").order("clave").order("vigente_desde").returns<Parametro[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("pl_metas").select("sucursal_id, renglon, tipo, valor").returns<{ sucursal_id: string; renglon: string; tipo: keyof typeof NOMBRE_TIPO; valor: number }[]>(),
    supabase.from("ventas_metas").select("sucursal_id, mes, monto").in("mes", [`${mesMeta}-01`, `${mesAnterior}-01`]).returns<{ sucursal_id: string; mes: string; monto: number }[]>(),
  ]);
  const metasVenta = metasVentaDatos ?? [];
  const suc = (sucursales ?? []).find((s) => s.id === q.sucursal) ?? (sucursales ?? [])[0];
  const claves = Object.keys(NOMBRE_PARAMETRO) as ClaveParametro[];
  return (
    <>
      <EncabezadoPagina titulo="Parámetros y metas" info="Los parámetros valen desde su fecha (no cambian meses anteriores). Las metas son por sucursal." />
      <Aviso ok={q.ok} error={q.error} />
      <section className="seccion">
        <h2>Parámetros</h2>
        <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
          {claves.map((c) => {
            const historial = (params ?? []).filter((p) => p.clave === c);
            return (
              <li key={c} className="fila">
                <div className="fila-nombre"><strong>{NOMBRE_PARAMETRO[c]}</strong><small>{historial.map((p) => `${(Number(p.valor) * 100).toFixed(2)} % desde ${p.vigente_desde}`).join(" · ") || "Sin valor"}</small></div>
                <div className="fila-datos"><span>Hoy: {(valorVigente(params ?? [], c, hoy) * 100).toFixed(2)} %</span><span /></div>
              </li>
            );
          })}
        </ul>
        {edita && (
          <form action={guardarParametro} className="formulario">
            <div className="rejilla">
              <div className="campo"><label htmlFor="p-cla">Parámetro</label><select id="p-cla" name="clave">{claves.map((c) => <option key={c} value={c}>{NOMBRE_PARAMETRO[c]}</option>)}</select></div>
              <div className="campo"><label htmlFor="p-val">Valor (%)</label><input id="p-val" name="valor" inputMode="decimal" required /></div>
              <div className="campo"><label htmlFor="p-vig">Desde</label><input id="p-vig" name="vigente_desde" type="date" defaultValue={`${hoy.slice(0, 7)}-01`} required /></div>
            </div>
            <BotonEnviar>Guardar parámetro</BotonEnviar>
          </form>
        )}
      </section>
      <section className="seccion" aria-labelledby="meta-venta">
        <h2 id="meta-venta">Meta de venta mensual</h2>
        <p className="saldo-nota">Venta neta sin IVA que se espera de cada sucursal en el mes. La usa Ventas BI (Venta vs Meta). Un campo vacío no cambia la meta. Para quitar una meta escribe 0.</p>
        <form method="get" className="barra-filtros"><input type="month" name="mes_meta" defaultValue={mesMeta} aria-label="Mes de la meta" /><button className="boton boton-secundario boton-compacto" type="submit">Ver</button></form>
        {edita ? (
          <form action={guardarMetasVenta} className="formulario">
            <input type="hidden" name="mes" value={mesMeta} />
            <div className="tabla-contenedor">
              <table className="tabla tabla-tarjetas">
                <thead><tr><th>Sucursal</th><th className="monto">Meta {mesMeta}</th><th className="monto">Mes anterior</th></tr></thead>
                <tbody>
                  {(sucursales ?? []).map((s) => {
                    const actual = metasVenta.find((m) => m.sucursal_id === s.id && m.mes === `${mesMeta}-01`);
                    const previa = metasVenta.find((m) => m.sucursal_id === s.id && m.mes === `${mesAnterior}-01`);
                    return (
                      <tr key={s.id}>
                        <td data-label="Sucursal">{s.nombre}</td>
                        <td data-label={`Meta ${mesMeta}`} className="monto"><input name={`monto_${s.id}`} inputMode="decimal" defaultValue={actual ? String(actual.monto) : ""} placeholder={previa ? String(previa.monto) : undefined} aria-label={`Meta de ${s.nombre}`} /></td>
                        <td data-label="Mes anterior" className="monto">{previa ? pesos(Number(previa.monto)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="acciones">
              <BotonEnviar>Guardar metas de venta</BotonEnviar>
              <button className="boton boton-secundario" type="submit" name="copiar" value="1">Copiar mes anterior</button>
            </div>
            <p className="saldo-nota">«Copiar mes anterior» guarda lo escrito y llena las sucursales vacías con su meta de {mesAnterior}.</p>
          </form>
        ) : <p className="saldo-nota">Solo admin captura las metas.</p>}
      </section>
      {suc && (
        <section className="seccion">
          <h2>Metas · {suc.nombre}</h2>
          <form className="barra-filtros" method="get"><select name="sucursal" defaultValue={suc.id} aria-label="Sucursal">{(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select><button className="boton boton-secundario boton-compacto" type="submit">Ver</button></form>
          <ul className="lista-filas" style={{ "--columnas": 1 } as React.CSSProperties}>
            {RENGLONES.filter((r) => r.tipo === "gasto").map((r) => {
              const m = (metas ?? []).find((x) => x.sucursal_id === suc.id && x.renglon === r.clave);
              const mostrar = m ? (m.tipo === "pct" || m.tipo === "pct_rappi" ? `${(Number(m.valor) * 100).toFixed(2)} %` : m.tipo === "plantilla" ? "plantilla" : `$${Number(m.valor).toLocaleString("es-MX")}`) : "Sin meta";
              return (
                <li key={r.clave} className="fila">
                  <div className="fila-nombre"><strong>{r.nombre}</strong><small>{m ? `${NOMBRE_TIPO[m.tipo]} · ${mostrar}` : "Sin meta"}</small></div>
                  <div className="fila-datos"><span>
                    {edita && (
                      <form action={guardarMeta} className="form-motivo">
                        <input type="hidden" name="sucursal_id" value={suc.id} />
                        <input type="hidden" name="renglon" value={r.clave} />
                        <select name="tipo" defaultValue={m?.tipo ?? "pct"} aria-label={`Tipo de meta de ${r.nombre}`}>{(Object.keys(NOMBRE_TIPO) as (keyof typeof NOMBRE_TIPO)[]).map((t) => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}</select>
                        <input name="valor" inputMode="decimal" aria-label={`Valor de la meta de ${r.nombre}`} defaultValue={m ? (m.tipo === "pct" || m.tipo === "pct_rappi" ? (Number(m.valor) * 100).toString() : String(m.valor)) : ""} />
                        <BotonEnviar className="boton boton-secundario">Guardar</BotonEnviar>
                      </form>
                    )}
                  </span></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
