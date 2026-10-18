import Link from "next/link";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { CampoArchivo } from "@/components/CampoArchivo";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX, pesos } from "@/lib/formato";
import { nombreMes } from "@/lib/finanzas/retenciones";
import type { MesRetenciones } from "@/lib/finanzas/retenciones";
import { puedeEditarFinanzas } from "@/lib/roles";
import { cargarRetenciones } from "./datos";
import { anularEntero, registrarEntero } from "./acciones";

const fecha = (f: string) => f.split("-").reverse().join("/");
function aviso(m: MesRetenciones) {
  switch (m.estado) {
    case "enterado": return `Enterado el ${fecha(m.ultimoEntero!)}`;
    case "de_mas": return `Enterado de más: IVA ${pesos(m.excesoIva)} · ISR ${pesos(m.excesoIsr)}`;
    case "falta": return `Falta enterar: IVA ${pesos(m.faltaIva)} · ISR ${pesos(m.faltaIsr)}${m.vencido ? " · Vencido" : ""}${m.excesoIva > 1 || m.excesoIsr > 1 ? ` · Exceso: IVA ${pesos(m.excesoIva)} · ISR ${pesos(m.excesoIsr)}` : ""}`;
    case "vencido": return "Vencido";
    case "por_vencer": return m.dias === 0 ? "Vence hoy" : `Vence en ${m.dias} días`;
    case "sin_retenciones": return "Sin retenciones";
    default: return "Pendiente";
  }
}
export default async function Retenciones({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyCalendarioMX(), edita = puedeEditarFinanzas(perfil.rol), q = await searchParams;
  const meses = await cargarRetenciones(supabase, hoy);
  const rutas = [...new Set(meses.flatMap((m) => m.enteros.flatMap((e) => e.acuse_ruta ? [e.acuse_ruta] : [])))];
  const enlaces = new Map<string, string>();
  // Firmar en lotes también cuando el historial crezca.
  for (let i = 0; i < rutas.length; i += 100) {
    const { data, error } = await supabase.storage.from("acuses-sat").createSignedUrls(rutas.slice(i, i + 100), 3600);
    if (error) throw new Error(`No se pudieron abrir los acuses: ${error.message}`);
    for (const d of data ?? []) if (d.path && d.signedUrl) enlaces.set(d.path, d.signedUrl);
  }
  return <>
    <EncabezadoPagina titulo="Retenciones" descripcion="IVA e ISR retenidos al pagar a proveedores. Fecha límite: el 17 del mes siguiente al pago." />
    <Aviso ok={q.ok} error={q.error} />
    {!meses.length && <EstadoVacio icono="banco" titulo="Sin retenciones todavía" descripcion="Aquí aparecerán los meses con pagos que retienen IVA o ISR, y sus enteros al SAT." />}
    {meses.map((m) => <section className="seccion" key={m.mes}>
      <div className="seccion-cabecera">
        <div><h2>{nombreMes(m.mes)}</h2><span className="insignia" data-tono={m.estado === "enterado" ? "exito" : m.estado === "sin_retenciones" ? undefined : m.estado === "por_vencer" ? "aviso" : "peligro"}>{aviso(m)}</span></div>
        <Link className="boton boton-secundario boton-compacto" href={`/reporte/retenciones/excel?mes=${m.mes}`}><Icono nombre="descargar" />Excel</Link>
      </div>
      <div className="indicadores-marco"><div className="indicadores retenciones-indicadores">
        <div className="indicador"><span className="indicador-etiqueta">IVA retenido</span><strong className="indicador-valor">{pesos(m.iva)}</strong><span className="indicador-detalle">Enterado {pesos(m.enteradoIva)}</span></div>
        <div className="indicador"><span className="indicador-etiqueta">ISR retenido</span><strong className="indicador-valor">{pesos(m.isr)}</strong><span className="indicador-detalle">Enterado {pesos(m.enteradoIsr)}</span></div>
        <div className="indicador" data-alerta={m.estado === "vencido" || (m.estado === "falta" && m.vencido) ? "peligro" : undefined}><span className="indicador-etiqueta">Enterar a más tardar</span><strong className="indicador-valor">{fecha(m.limite)}</strong></div>
      </div></div>
      <details><summary>Detalle de pagos ({m.renglones.length})</summary>
        <ul className="lista-filas" style={{ "--columnas": 4 } as React.CSSProperties}>
          <li className="fila fila-encabezado" aria-hidden="true"><span>Proveedor / Factura</span><span>Pago</span><span>Pagado</span><span>IVA retenido</span><span>ISR retenido</span></li>
          {m.renglones.map((r, i) => <li className="fila" key={`${r.pagoId}-${r.facturaId}-${i}`}>
            <div className="fila-nombre"><strong>{r.proveedor}</strong><small>{r.rfc}</small><Link href={`/compras/facturas/${r.facturaId}`}>{r.factura}</Link></div>
            <div className="fila-datos"><span><Link href={`/compras/pagos/${r.pagoId}`}>{fecha(r.fecha)}</Link></span><span>{pesos(r.pagado)}</span><span>IVA {pesos(r.iva)}</span><span>ISR {pesos(r.isr)}</span></div>
          </li>)}
        </ul>
      </details>
      <h3>Enteros al SAT</h3>
      {!m.enteros.length && <p>Sin enteros registrados.</p>}
      <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
        {m.enteros.map((e) => <li className="fila" key={e.id}>
          <div className="fila-nombre"><strong style={e.anulado_en ? { textDecoration: "line-through" } : undefined}>{fecha(e.fecha)} · {e.operacion || "Sin número de operación"}</strong>
            {e.anulado_en && <small>Anulado: {e.motivo_anulacion}</small>}
            {e.acuse_ruta && (enlaces.has(e.acuse_ruta) ? <a href={enlaces.get(e.acuse_ruta)} target="_blank" rel="noreferrer">Ver acuse</a> : <small>Acuse no disponible</small>)}
            {edita && !e.anulado_en && <details><summary>Anular</summary><form action={anularEntero} className="formulario"><input type="hidden" name="id" value={e.id} /><div className="campo"><label htmlFor={`motivo-${e.id}`}>Motivo</label><input id={`motivo-${e.id}`} name="motivo" required /></div><BotonEnviar confirmar="¿Anular este entero? Se conservará el historial.">Anular entero</BotonEnviar></form></details>}
          </div><div className="fila-datos" style={e.anulado_en ? { textDecoration: "line-through" } : undefined}><span>IVA {pesos(e.iva)}</span><span>ISR {pesos(e.isr)}</span></div>
        </li>)}
      </ul>
      {edita && <details><summary>Registrar entero</summary><form action={registrarEntero} className="formulario">
        <input type="hidden" name="mes" value={m.mes} /><div className="rejilla">
          <div className="campo"><label htmlFor={`fecha-${m.mes}`}>Fecha del entero</label><input id={`fecha-${m.mes}`} name="fecha" type="date" min={`${m.mes}-01`} max={hoy} defaultValue={hoy} required /></div>
          <div className="campo"><label htmlFor={`iva-${m.mes}`}>IVA enterado</label><input id={`iva-${m.mes}`} name="iva" type="number" min="0" step="0.01" defaultValue={m.faltaIva.toFixed(2)} required /></div>
          <div className="campo"><label htmlFor={`isr-${m.mes}`}>ISR enterado</label><input id={`isr-${m.mes}`} name="isr" type="number" min="0" step="0.01" defaultValue={m.faltaIsr.toFixed(2)} required /></div>
          <div className="campo"><label htmlFor={`op-${m.mes}`}>Número de operación</label><input id={`op-${m.mes}`} name="operacion" maxLength={60} /></div>
          <CampoArchivo id={`acuse-${m.mes}`} name="acuse" etiqueta="Acuse (opcional, hasta 4 MB)" accept="application/pdf,image/jpeg,image/png,image/webp" />
        </div><BotonEnviar>Guardar entero</BotonEnviar>
      </form></details>}
    </section>)}
  </>;
}
