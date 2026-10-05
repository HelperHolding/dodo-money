import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX, pesos } from "@/lib/formato";
import { CUENTAS_GASTO, NOMBRE_CUENTA, type CuentaGasto } from "@/lib/finanzas/cuentas";
import { puedeEditarFinanzas } from "@/lib/roles";
import { agregarGastoMes, quitarGastoMes } from "./acciones";

export default async function GastosMes({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  const q = await searchParams;
  const mes = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : hoyMX().slice(0, 7);
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarFinanzas(perfil.rol);
  const [{ data: sucursales }, { data: gastos }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("gastos_mes").select("id, sucursal_id, cuenta, monto, concepto").eq("mes", `${mes}-01`).order("creado_en")
      .returns<{ id: string; sucursal_id: string | null; cuenta: CuentaGasto; monto: number; concepto: string }[]>(),
  ]);
  const nombre = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  return (
    <>
      <div className="encabezado"><h1>Gastos del mes</h1><p>Lo que no tiene factura (renta sin CFDI, pagos en efectivo…). Montos sin IVA.</p></div>
      <Aviso ok={q.ok} error={q.error} />
      <form className="acciones" method="get"><label htmlFor="mes" className="etiqueta">Mes</label><input id="mes" name="mes" type="month" defaultValue={mes} /><button className="boton boton-secundario" type="submit">Ver</button></form>
      <section className="seccion">
        {!gastos?.length ? <p className="vacio">Sin gastos capturados este mes.</p> : (
          <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
            {gastos.map((g) => (
              <li key={g.id} className="fila">
                <div className="fila-nombre"><strong>{g.concepto}</strong><small>{g.sucursal_id ? nombre.get(g.sucursal_id) : "Oficina central"}</small></div>
                <div className="fila-datos"><span>{NOMBRE_CUENTA[g.cuenta]}</span><span>{pesos(g.monto)}
                  {edita && <form action={quitarGastoMes} style={{ display: "inline" }}><input type="hidden" name="id" value={g.id} /> <BotonEnviar className="boton boton-secundario" confirmar="¿Quitar este gasto?">Quitar</BotonEnviar></form>}</span></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {edita && (
        <form action={agregarGastoMes} className="seccion formulario">
          <h2>Agregar gasto</h2>
          <input type="hidden" name="mes" value={mes} />
          <div className="rejilla">
            <div className="campo"><label htmlFor="g-suc">Sucursal</label><select id="g-suc" name="sucursal_id">{(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}<option value="oficina">Oficina central</option></select></div>
            <div className="campo"><label htmlFor="g-cue">Cuenta</label><select id="g-cue" name="cuenta">{CUENTAS_GASTO.map((c) => <option key={c} value={c}>{NOMBRE_CUENTA[c]}</option>)}</select></div>
            <div className="campo"><label htmlFor="g-con">Concepto</label><input id="g-con" name="concepto" required /></div>
            <div className="campo"><label htmlFor="g-mon">Monto sin IVA</label><input id="g-mon" name="monto" inputMode="decimal" required /></div>
          </div>
          <BotonEnviar>Agregar</BotonEnviar>
        </form>
      )}
    </>
  );
}
