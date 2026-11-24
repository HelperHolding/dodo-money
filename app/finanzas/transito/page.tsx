import Link from "next/link";
import { ConInfo } from "@/components/ConInfo";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { leerRazonesSociales } from "@/lib/compras/razonesSociales";
import type { CuentaPuente } from "@/lib/finanzas/transito";
import { DESDE, DIAS_NORMALES, leerTransito } from "./datos";

const CUENTAS = [
  { clave: "tarjeta", titulo: "Tarjeta → banco", entra: "Venta con tarjeta (conciliada con NetPay)", sale: "Depósito NetPay + comisiones conciliados en Banca", dias: DIAS_NORMALES.tarjeta, banco: true },
  { clave: "rappi", titulo: "Rappi → banco", entra: "Lote liquidado (neto del reporte financiero)", sale: "Depósito de Rappi conciliado en Banca", dias: DIAS_NORMALES.rappi, banco: true },
  { clave: "recoleccion", titulo: "Bóveda → corporativo", entra: "Recolección que sale de la bóveda", sale: "Recibida en corporativo", dias: DIAS_NORMALES.recoleccion, banco: false },
  { clave: "deposito", titulo: "Corporativo → banco", entra: "Efectivo recibido en corporativo", sale: "Depósito de efectivo conciliado en Banca", dias: DIAS_NORMALES.deposito, banco: true },
] as const;

function Tarjeta({ c, cuenta, corte }: { c: (typeof CUENTAS)[number]; cuenta: CuentaPuente; corte: string | null }) {
  const despuesDelCorte = (fecha: string) => c.banco && !!corte && fecha > corte;
  return (
    <section className="seccion transito-cuenta" aria-labelledby={`t-${c.clave}`} data-alerta={cuenta.atrasados ? "si" : undefined}>
      <div className="transito-cabecera">
        <div><h2 id={`t-${c.clave}`}>{c.titulo}</h2><p className="saldo-nota">Entra: {c.entra} · Sale: {c.sale}</p>
          {c.banco && corte && <p className="saldo-nota">Banco importado hasta el {fechaTexto(corte)}: los días se cuentan hasta ahí y lo posterior se espera en el siguiente estado de cuenta.</p>}</div>
        <div className="transito-saldo"><span>En tránsito</span><strong>{pesos(cuenta.saldo)}</strong>
          <small>{cuenta.pendientes.length ? `${cuenta.pendientes.length} ${cuenta.pendientes.length === 1 ? "partida" : "partidas"} · la más vieja de ${cuenta.diasMasViejo} ${cuenta.diasMasViejo === 1 ? "día" : "días"}` : "Nada en tránsito"}</small></div>
      </div>
      <dl className="transito-totales">
        <div><dt>Entró desde el {fechaTexto(DESDE)}</dt><dd>{pesos(cuenta.entradas)}</dd></div>
        <div><dt>Ya llegó</dt><dd>{pesos(cuenta.salidas)}</dd></div>
        {cuenta.atrasados > 0 && <div data-alerta="si"><dt>Atrasadas (más de {c.dias} días)</dt><dd>{cuenta.atrasados}</dd></div>}
        {cuenta.sobrante > 0 && <div><dt>Llegó sin entrada en el periodo</dt><dd>{pesos(cuenta.sobrante)}</dd></div>}
      </dl>
      {cuenta.pendientes.length > 0 && (
        <details open={cuenta.atrasados > 0}>
          <summary>Ver lo que sigue en tránsito</summary>
          <ul className="transito-lista">
            {cuenta.pendientes.map((p, i) => (
              <li key={`${p.fecha}-${i}`} data-alerta={p.atrasado ? "si" : undefined}>
                <span>{fechaTexto(p.fecha)} · {p.href ? <Link href={p.href}>{p.texto}</Link> : p.texto}</span>
                <span>{despuesDelCorte(p.fecha) ? "después del corte del banco" : `${p.dias} ${p.dias === 1 ? "día" : "días"}${p.atrasado ? " · atrasado" : ""}`}</span>
                <strong>{pesos(p.restante)}{p.restante !== p.monto ? <small> de {pesos(p.monto)}</small> : null}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default async function DineroEnTransito({ searchParams }: { searchParams: Promise<{ sucursal?: string; empresa?: string }> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyCalendarioMX();
  const [{ data: sucursales }, razones] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    leerRazonesSociales(supabase),
  ]);
  const sucursal = (sucursales ?? []).some((s) => s.id === q.sucursal) ? q.sucursal! : "";
  const empresa = razones.some((r) => r.rfc === q.empresa) ? q.empresa! : "";
  const cuentas = await leerTransito(supabase, { sucursal, empresa }, hoy);
  const total = CUENTAS.reduce((t, c) => t + Math.round(cuentas[c.clave].saldo * 100), 0) / 100;
  return (
    <>
      <EncabezadoPagina titulo="Dinero en tránsito" descripcion={<>Cuentas puente: lo que salió de un lado y aún no llega al otro · {pesos(total)} en total</>} />
      <ConInfo titulo="Dinero en tránsito" etiqueta="Cómo leer esto">
        Cada cuenta suma lo que entra y lo cubre con lo que llega, empezando por lo más viejo. Lo que queda sin cubrir es el saldo en tránsito.
        Cuenta desde el {fechaTexto(DESDE)}, desde cuando está importado el banco; lo que llegó de ventas anteriores aparece como «llegó sin entrada».
        Solo consulta: no registra pagos ni mueve la bóveda. Los depósitos cuentan cuando están conciliados en Banca.
      </ConInfo>
      <form className="barra-filtros" role="search">
        <div className="campo"><label htmlFor="sucursal" className="solo-lector">Sucursal</label>
          <select id="sucursal" name="sucursal" defaultValue={sucursal}><option value="">Todas las sucursales</option>{(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
        <div className="campo"><label htmlFor="empresa" className="solo-lector">Razón social</label>
          <select id="empresa" name="empresa" defaultValue={empresa}><option value="">Todas las razones sociales</option>{razones.map((r) => <option key={r.rfc} value={r.rfc}>{r.razon_social}</option>)}</select></div>
        <button className="boton boton-secundario boton-compacto" type="submit">Filtrar</button>
      </form>
      {CUENTAS.map((c) => <Tarjeta key={c.clave} c={c} cuenta={cuentas[c.clave]} corte={cuentas.corteBanco} />)}
    </>
  );
}
