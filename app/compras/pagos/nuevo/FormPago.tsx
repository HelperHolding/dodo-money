"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { fechaTexto, pesos } from "@/lib/formato";
import { repartirConAjustes, revisarPago, type PorPagar } from "@/lib/compras/pagos";
import { esDiaDePago, NOMBRE_DIA } from "@/lib/compras/diasPago";
import type { FormaPago } from "@/lib/compras/proveedores";
import Link from "next/link";
import { registrarPago } from "../acciones";

export type FacturaParaPagar = PorPagar & { nombre: string; bloqueada: string | null };
export type ReservaPago={id:string;factura_id:string;pendiente:number;sucursal_id:string;sucursales:{nombre:string}|null};

/** El monto se reparte solo por fecha de pago; cada factura se puede ajustar a mano. */
export function FormPago({ proveedorId, facturas, hoy, preseleccion, dias,reservas,reservaInicial,solicitud }: {
  proveedorId: string; facturas: FacturaParaPagar[]; forma: FormaPago; hoy: string; preseleccion: string | null;
  /** Días de pago autorizados (ISO): otro día pide motivo. */
  dias: number[];
  reservas:ReservaPago[];reservaInicial:string|null;
  solicitud:string;
}) {
  const inicialReserva=reservas.find(r=>r.id===reservaInicial);
  const [origen,setOrigen]=useState(inicialReserva?"boveda":"transferencia");
  const [reserva,setReserva]=useState(inicialReserva?.id??"");
  const elegidaReserva=reservas.find(r=>r.id===reserva);
  const [fecha, setFecha] = useState(hoy);
  const diaDePago = esDiaDePago(fecha, dias);
  const pagables = facturas.filter((f) => !f.bloqueada&&(origen!=="boveda"||f.id===elegidaReserva?.factura_id));
  const inicial = inicialReserva?String(Math.min(Number(inicialReserva.pendiente),Number(pagables.find(f=>f.id===inicialReserva.factura_id)?.saldo??0))):preseleccion ? String(pagables.find((f) => f.id === preseleccion)?.saldo ?? "") : "";
  const [monto, setMonto] = useState(inicial);
  const numero = (t: string) => Number(t.replace(/[$\s,]/g, "")) || 0;
  // Si se llegó desde una factura, esa se paga primero (hasta su saldo); el resto del monto se reparte entre las demás.
  const deLaElegida = (m: string): Record<string, string> => {
    const elegida = pagables.find((f) => f.id === (origen==="boveda"?elegidaReserva?.factura_id:preseleccion));
    return elegida && numero(m) > 0 ? { [elegida.id]: String(Math.min(Number(elegida.saldo), numero(m))) } : {};
  };
  const [manual, setManual] = useState<Record<string, string>>(() => deLaElegida(inicial));
  const reparto = repartirConAjustes(numero(monto), pagables, Object.fromEntries(Object.entries(manual).map(([id, v]) => [id, numero(v)])));
  const aplicado = (id: string) => manual[id] ?? String(reparto.aplicaciones.find((a) => a.factura_id === id)?.monto ?? "");
  const aplicaciones = pagables.map((f) => ({ factura_id: f.id, monto: numero(aplicado(f.id)) }));
  const problema = revisarPago(numero(monto), aplicaciones, new Map(pagables.map((f) => [f.id, Number(f.saldo)])));

  return (
    <form action={registrarPago} className="seccion formulario">
      <input type="hidden" name="proveedor_id" value={proveedorId} />
      <input type="hidden" name="solicitud" value={solicitud} />
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="monto">Monto pagado</label>
          <input id="monto" name="monto" inputMode="decimal" required value={monto} onChange={(e) => { setMonto(e.target.value); setManual(deLaElegida(e.target.value)); }} />
        </div>
        <div className="campo"><label htmlFor="fecha">Fecha del pago</label><input id="fecha" name="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={hoy} required /></div>
        <div className="campo">
          <label htmlFor="origen">Origen del dinero</label>
          <select id="origen" name="origen" value={origen} onChange={e=>{setOrigen(e.target.value);setManual({});setMonto("");}}>
            <option value="transferencia">Transferencia bancaria</option><option value="boveda">Efectivo de bóveda reservado</option>
          </select>
        </div>
        {origen==="transferencia"?<div className="campo"><label htmlFor="cuenta_origen">Cuenta de transferencia</label><input id="cuenta_origen" name="cuenta_origen" required minLength={2} placeholder="Ej. Banregio empresa" /></div>:<div className="campo"><label htmlFor="reserva">Reserva autorizada</label><select id="reserva" name="reserva" value={reserva} required onChange={e=>{setReserva(e.target.value);setManual({});const r=reservas.find(r=>r.id===e.target.value);setMonto(r?String(Math.min(Number(r.pendiente),Number(facturas.find(f=>f.id===r.factura_id)?.saldo??0))):"");}}><option value="">Elige…</option>{reservas.map(r=><option key={r.id} value={r.id}>{r.sucursales?.nombre} · {facturas.find(f=>f.id===r.factura_id)?.nombre} · {pesos(r.pendiente)} pendientes</option>)}</select><small>Se descuenta del efectivo al registrar el pago. Se conserva el fondo.</small><Link href="/compras/pagos/reservas">Autorizar o revisar reservas →</Link></div>}
        <div className="campo"><label htmlFor="referencia">Referencia o clave de rastreo</label><input id="referencia" name="referencia" /></div>
        {!diaDePago && (
          <div className="campo">
            <label htmlFor="motivo_fuera_de_dia">Motivo del pago extraordinario</label>
            <input id="motivo_fuera_de_dia" name="motivo_fuera_de_dia" required placeholder="Ej. el proveedor corta el servicio" />
            <small>Los días de pago son: {dias.map((d) => NOMBRE_DIA[d].toLowerCase()).join(", ")}.</small>
          </div>
        )}
        <div className="campo"><label htmlFor="comprobante">Comprobante (PDF o foto, opcional)</label><input id="comprobante" name="comprobante" type="file" accept="application/pdf,image/*" /></div>
      </div>

      <fieldset className="campo">
        <legend>A qué facturas se aplica</legend>
        <div className="tarjetas">
          {facturas.filter(f=>origen!=="boveda"||f.id===elegidaReserva?.factura_id).map((f) => (
            <article key={f.id} className="tarjeta" data-alerta={f.bloqueada ? "si" : undefined}>
              <div className="tarjeta-encabezado"><div>
                <h3>{f.nombre}</h3>
                <p className="tarjeta-estado">Saldo {pesos(f.saldo)} · vence {fechaTexto(f.vence_el)}</p>
              </div></div>
              {f.bloqueada ? <p className="saldo-nota">{f.bloqueada}</p> : (
                <div className="campo">
                  <label htmlFor={`a-${f.id}`}>Aplicar</label>
                  <input id={`a-${f.id}`} name={`aplicar_${f.id}`} inputMode="decimal" value={aplicado(f.id)}
                    onChange={(e) => setManual({ ...manual, [f.id]: e.target.value })} />
                </div>
              )}
            </article>
          ))}
        </div>
      </fieldset>

      {reparto.sobrante > 0 && <p className="aviso aviso-error">Sobran {pesos(reparto.sobrante)}: el monto pasa del saldo de las facturas.</p>}
      {problema && numero(monto) > 0 && <p className="saldo-nota" role="status">{problema}</p>}
      <BotonEnviar pendiente="Registrando…">Registrar pago</BotonEnviar>
    </form>
  );
}
