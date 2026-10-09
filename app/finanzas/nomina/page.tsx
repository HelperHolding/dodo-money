import { NominaRealPanel } from "./NominaReal";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX, pesos } from "@/lib/formato";
import { baseNominaMes, realDelMes, costoPuesto, plantillaVigente, type Puesto, type NominaReal, conceptosNomina, totalEmpleado } from "@/lib/finanzas/nomina";
import { finDeMes as finDe } from "@/lib/finanzas/pl";
import { puedeEditarFinanzas } from "@/lib/roles";
import { agregarAjuste, guardarPuesto, quitarAjuste } from "./acciones";

export default async function PaginaNomina({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  const q = await searchParams;
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : hoyMX().slice(0, 7);
  const finDeMes = finDe(mes);
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarFinanzas(perfil.rol);
  const [{ data: sucursales }, { data: puestos }, { data: ajustes }, { data: versiones, error: errorReales }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("nomina_plantilla").select("sucursal_id, puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde").returns<Puesto[]>(),
    supabase.from("nomina_ajustes").select("id, sucursal_id, renglon, monto, concepto").eq("mes", `${mes}-01`).order("creado_en")
      .returns<{ id: string; sucursal_id: string | null; renglon: string; monto: number; concepto: string }[]>(),
    supabase.from("nomina_reales").select("id, sucursal_id, mes, fuente, empleados, anulada_en, creado_en, motivo_anulacion").eq("mes", `${mes}-01`).order("creado_en", {ascending: false}).returns<(NominaReal & {anulada_en: string | null; creado_en: string; motivo_anulacion: string | null})[]>(),
  ]);
  if (errorReales) throw new Error(`No se pudo cargar nómina real: ${errorReales.message}`);
  const reales = (versiones ?? []).filter((v) => !v.anulada_en);
  const lugares = [...(sucursales ?? []).map((s) => ({ id: s.id as string | null, nombre: s.nombre })), { id: null, nombre: "Oficina central" }];

  return (
    <>
      <div className="encabezado"><h1>Nómina</h1><p>Nómina real mensual o plantilla estimada, más ajustes del mes. Se incluye en el P&L; capturar nómina no registra un pago.</p></div>
      <Aviso ok={q.ok} error={q.error} />
      <form className="acciones" method="get">
        <label htmlFor="mes" className="etiqueta">Mes</label>
        <input id="mes" name="mes" type="month" defaultValue={mes} />
        <button className="boton boton-secundario" type="submit">Ver</button>
      </form>
      {lugares.map((l) => {
        const real = realDelMes(reales, l.id, mes);
        const vigentes = real ? [] : plantillaVigente(puestos ?? [], l.id, finDeMes);
        const aj = (ajustes ?? []).filter((a) => a.sucursal_id === l.id);
        const base = baseNominaMes(puestos ?? [], reales, l.id, finDeMes);
        const total = base.cocina + base.gerencia + aj.reduce((t, a) => t + Number(a.monto), 0);
        return (
          <section key={l.id ?? "oficina"} className="seccion">
            <h2>{l.nombre} · {pesos(total)}</h2>
            {!real && vigentes.length > 0 && <p>Importe estimado según la plantilla. Falta capturar la nómina real de {mes}.</p>}
            <NominaRealPanel real={real} mes={mes} sucursal={l.id} edita={edita} />
            {(versiones ?? []).some(v => v.sucursal_id === l.id && v.anulada_en) && <details className="seccion"><summary>Historial de nómina real</summary>{(versiones ?? []).filter(v => v.sucursal_id === l.id && v.anulada_en).map(v => <div key={v.id}><p>{v.creado_en} · {v.fuente} · {v.motivo_anulacion}</p>{v.empleados.map(e => <details key={e.nombre}><summary>{e.nombre} · {e.puesto} · {pesos(totalEmpleado(e))}</summary><dl>{Object.entries(conceptosNomina).map(([k,nombre]) => <div className="fila-datos" key={k}><dt>{nombre}</dt><dd>{pesos(e[k as keyof typeof conceptosNomina])}</dd></div>)}</dl>{e.nota && <p>{e.nota}</p>}</details>)}</div>)}</details>}
            {(vigentes.length > 0 || aj.length > 0) && <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
              <li className="fila fila-encabezado" aria-hidden="true"><span>Puesto</span><span>Personas</span><span>Sueldo + cargas</span><span>Costo del mes</span></li>
              {vigentes.map((p) => (
                <li key={p.puesto} className="fila">
                  <div className="fila-nombre"><strong>{p.puesto}</strong><small>{p.renglon} · desde {p.vigente_desde}</small></div>
                  <div className="fila-datos"><span>{p.personas}</span><span>{pesos(p.sueldo)} + {(Number(p.pct_cargas) * 100).toFixed(2)} %{Number(p.bono) ? ` + bono ${pesos(p.bono)}` : ""}</span><span>{pesos(costoPuesto(p))}</span></div>
                </li>
              ))}
              {aj.map((a) => (
                <li key={a.id} className="fila">
                  <div className="fila-nombre"><strong>Ajuste · {a.concepto}</strong><small>{a.renglon}</small></div>
                  <div className="fila-datos"><span /><span /><span>{pesos(a.monto)}
                    {edita && <form action={quitarAjuste} style={{ display: "inline" }}><input type="hidden" name="id" value={a.id} /> <BotonEnviar className="boton boton-secundario" confirmar="¿Quitar este ajuste?">Quitar</BotonEnviar></form>}
                  </span></div>
                </li>
              ))}
            </ul>}
          </section>
        );
      })}
      {edita && (
        <>
          <details className="seccion">
            <summary>Agregar o cambiar un puesto</summary>
            <form action={guardarPuesto} className="formulario">
              <div className="rejilla">
                <div className="campo"><label htmlFor="p-suc">Sucursal</label><select id="p-suc" name="sucursal_id">{lugares.map((l) => <option key={l.id ?? "oficina"} value={l.id ?? "oficina"}>{l.nombre}</option>)}</select></div>
                <div className="campo"><label htmlFor="p-puesto">Puesto</label><input id="p-puesto" name="puesto" required placeholder="Ej. Pizzero / cajero" /></div>
                <div className="campo"><label htmlFor="p-ren">Renglón</label><select id="p-ren" name="renglon"><option value="cocina">Cocina</option><option value="gerencia">Gerencia</option></select></div>
                <div className="campo"><label htmlFor="p-per">Personas</label><input id="p-per" name="personas" inputMode="numeric" required /><small>0 para quitarlo desde esa fecha.</small></div>
                <div className="campo"><label htmlFor="p-sue">Sueldo mensual por persona</label><input id="p-sue" name="sueldo" inputMode="decimal" required /></div>
                <div className="campo"><label htmlFor="p-car">Cargas sociales (%)</label><input id="p-car" name="pct_cargas" inputMode="decimal" defaultValue="12" /></div>
                <div className="campo"><label htmlFor="p-bon">Bono mensual por persona</label><input id="p-bon" name="bono" inputMode="decimal" defaultValue="0" /></div>
                <div className="campo"><label htmlFor="p-vig">Desde</label><input id="p-vig" name="vigente_desde" type="date" defaultValue={`${mes}-01`} required /></div>
              </div>
              <BotonEnviar>Guardar puesto</BotonEnviar>
            </form>
          </details>
          <details className="seccion">
            <summary>Agregar un ajuste del mes</summary>
            <form action={agregarAjuste} className="formulario">
              <input type="hidden" name="mes" value={mes} />
              <div className="rejilla">
                <div className="campo"><label htmlFor="a-suc">Sucursal</label><select id="a-suc" name="sucursal_id">{lugares.map((l) => <option key={l.id ?? "oficina"} value={l.id ?? "oficina"}>{l.nombre}</option>)}</select></div>
                <div className="campo"><label htmlFor="a-ren">Renglón</label><select id="a-ren" name="renglon"><option value="cocina">Cocina</option><option value="gerencia">Gerencia</option></select></div>
                <div className="campo"><label htmlFor="a-con">Concepto</label><input id="a-con" name="concepto" required placeholder="Bonos, horas extra, finiquito…" /></div>
                <div className="campo"><label htmlFor="a-mon">Monto</label><input id="a-mon" name="monto" inputMode="decimal" required /><small>Negativo si resta.</small></div>
              </div>
              <BotonEnviar>Agregar ajuste</BotonEnviar>
            </form>
          </details>
        </>
      )}
    </>
  );
}
