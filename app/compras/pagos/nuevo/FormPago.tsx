"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { fechaTexto, pesos } from "@/lib/formato";
import { repartirConAjustes, revisarPago, type PorPagar } from "@/lib/compras/pagos";
import { esDiaDePago, NOMBRE_DIA } from "@/lib/compras/diasPago";
import type { FormaPago } from "@/lib/compras/proveedores";
import { registrarPago } from "../acciones";

export type FacturaParaPagar = PorPagar & { nombre: string; bloqueada: string | null };
export type ReservaPago={id:string;factura_id:string;pendiente:number;sucursal_id:string;sucursales:{nombre:string}|null};

/** El monto se reparte solo por fecha de pago; cada factura se puede ajustar a mano. */
export function FormPago({ proveedorId, facturas, hoy, preseleccion, dias,reservas,reservaInicial,solicitud,bovedas,ventas }: {
  proveedorId: string; facturas: FacturaParaPagar[]; forma: FormaPago; hoy: string; preseleccion: string | null;
  /** Días de pago autorizados (ISO): otro día pide motivo. */
  dias: number[];
  reservas:ReservaPago[];reservaInicial:string|null;
  solicitud:string;
  bovedas:{id:string;nombre:string;disponible:number}[]; ventas:{id:string;nombre:string;disponible:number}[];
}) {
  const inicialReserva=reservas.find(r=>r.id===reservaInicial);
  const [origen,setOrigen]=useState(inicialReserva?"boveda":"transferencia");
  const reserva=inicialReserva?.id??"";
  const elegidaReserva=reservas.find(r=>r.id===reserva);
  const [facturaCash, setFacturaCash] = useState(preseleccion ?? "");
  const [sucursalCash, setSucursalCash] = useState("");
  const [historico,setHistorico]=useState(false);
  const cash = origen === "boveda_acumulado"||origen==="ventas";
  const unDocumento=cash||historico;
  const [fecha, setFecha] = useState(hoy);
  const diaDePago = esDiaDePago(fecha, dias);
  const pagables = facturas.filter((f) => !f.bloqueada&&(origen!=="boveda"||f.id===elegidaReserva?.factura_id)&&(!unDocumento||f.id===facturaCash));
  const inicial = inicialReserva?String(Math.min(Number(inicialReserva.pendiente),Number(pagables.find(f=>f.id===inicialReserva.factura_id)?.saldo??0))):preseleccion ? String(pagables.find((f) => f.id === preseleccion)?.saldo ?? "") : "";
  const [monto, setMonto] = useState(inicial);
  const numero = (t: string) => Number(t.replace(/[$\s,]/g, "")) || 0;
  // Si se llegó desde una factura, esa se paga primero (hasta su saldo); el resto del monto se reparte entre las demás.
  const deLaElegida = (m: string): Record<string, string> => {
    const elegida = pagables.find((f) => f.id === (origen==="boveda"?elegidaReserva?.factura_id:unDocumento?facturaCash:preseleccion));
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
      <div className="campo">
        <label htmlFor="tipo-registro-pago">Tipo de registro</label>
        <select id="tipo-registro-pago" value={historico?"informativo":"actual"} onChange={e=>{const informativo=e.target.value==="informativo";setHistorico(informativo);if(informativo&&origen==="boveda")setOrigen("boveda_acumulado");else if(!informativo&&inicialReserva&&origen==="boveda_acumulado")setOrigen("boveda");setManual({});setMonto("");}}>
          <option value="actual">Registrar pago</option>
          <option value="informativo">Cuadrado en corte correspondiente, informativo</option>
        </select>
        <input type="hidden" name="historico" value={historico?"on":"off"}/>
        {historico&&<small>Conserva la fecha y el origen original. No genera otra salida ni vuelve a descontar el saldo.</small>}
      </div>
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="monto">Monto pagado</label>
          <input id="monto" name="monto" inputMode="decimal" required value={monto} onChange={(e) => { setMonto(e.target.value); setManual(deLaElegida(e.target.value)); }} />
        </div>
        <div className="campo"><label htmlFor="fecha">Fecha del pago</label><input id="fecha" name="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={historico ? new Date(new Date(`${hoy}T12:00:00Z`).getTime()-86400000).toISOString().slice(0,10) : hoy} min={!historico&&cash?hoy:undefined} required /></div>
        <div className="campo">
          <label htmlFor="origen">¿De dónde salió el dinero?</label>
          <select id="origen" name="origen" value={origen} onChange={e=>{setOrigen(e.target.value);setSucursalCash("");setManual({});setMonto("");}}>
            <option value={inicialReserva&&!historico?"boveda":"boveda_acumulado"}>Bóveda · efectivo acumulado</option><option value="ventas">Caja de ventas</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option>
          </select>
        </div>
        {historico?<>
          <div className="campo"><label htmlFor="sucursal_historica">Sucursal del pago original</label><select id="sucursal_historica" name="sucursal_historica" required defaultValue=""><option value="" disabled>Elige…</option>{bovedas.map(b=><option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
          <div className="campo"><label htmlFor="nota_boveda">Motivo y respaldo del descuento anterior</label><textarea id="nota_boveda" name="nota_boveda" required minLength={10} maxLength={1000} placeholder="Indica en qué corte, conteo o movimiento ya quedó descontado y por qué se captura ahora."/></div>
          <p className="aviso">Solo aplica el pago al documento. No vuelve a descontar dinero, no genera reservas y no modifica cortes anteriores. El P&L depende de la cuenta y del periodo del documento; no registres el gasto nuevamente en caja chica.</p>
          <label><input type="checkbox" name="confirmado" value="si" required/> Confirmo que este pago ya ocurrió y su dinero ya está descontado del saldo; este registro no debe moverlo otra vez.</label>
        </>:cash?<>
          <div className="campo"><label htmlFor="sucursal_boveda">{origen==="ventas"?"Caja de ventas / turno":"Bóveda de la sucursal"}</label>
          <select id="sucursal_boveda" name={origen==="ventas"?"turno_ventas":"sucursal_boveda"} required value={sucursalCash} onChange={e=>setSucursalCash(e.target.value)}><option value="">Elige…</option>{(origen==="ventas"?ventas:bovedas).map(b=><option key={b.id} value={b.id}>{b.nombre} · disponible {pesos(b.disponible)}</option>)}</select></div>
          <div className="campo"><label htmlFor="nota_boveda">Motivo del pago</label><textarea id="nota_boveda" name="nota_boveda" required minLength={5} maxLength={1000} placeholder="Compra de insumos, servicio u otro motivo específico."/>
          <small>{origen==="ventas"?"Descuenta de la caja del turno actual contra su último arqueo confirmado. Si conservas efectivo de días anteriores, debe estar incluido en el fondo de apertura y el conteo del turno actual; no selecciones un turno cerrado.":"Usa el acumulado disponible en bóveda sin liberación manual por días. Se conservan el fondo y los compromisos existentes."} La salida queda en el corte actual, sin modificar cortes anteriores.</small></div>
        </>:origen==="boveda"?<><input type="hidden" name="reserva" value={reserva}/><p className="saldo-nota">Se utilizará el efectivo ya apartado para este documento. No necesitas otra autorización.</p></>:null}
        {(origen==="transferencia"||origen==="tarjeta")&&<div className="campo"><label htmlFor="cuenta_origen">{origen==="tarjeta"?"Tarjeta utilizada":"Cuenta de transferencia"}</label><input id="cuenta_origen" name="cuenta_origen" required minLength={2} maxLength={200} placeholder={origen==="tarjeta"?"Banco y últimos 4 dígitos (sin número completo)":"Banco y nombre de la cuenta"}/></div>}
        {unDocumento&&<div className="campo"><label htmlFor="factura_cash">Documento al que se aplica</label><select id="factura_cash" required value={facturaCash} onChange={e=>{setFacturaCash(e.target.value);setMonto("");setManual({});}}><option value="">Elige…</option>{facturas.filter(f=>!f.bloqueada).map(f=><option key={f.id} value={f.id}>{f.nombre}</option>)}</select></div>}
        <div className="campo"><label htmlFor="referencia">Referencia o clave de rastreo</label><input id="referencia" name="referencia" required={historico} minLength={historico?3:undefined} maxLength={200} /></div>
        {!diaDePago && !historico && !cash && (
          <div className="campo">
            <label htmlFor="motivo_fuera_de_dia">Motivo del pago extraordinario</label>
            <input id="motivo_fuera_de_dia" name="motivo_fuera_de_dia" required placeholder="Ej. el proveedor corta el servicio" />
            <small>Los días de pago son: {dias.map((d) => NOMBRE_DIA[d].toLowerCase()).join(", ")}.</small>
          </div>
        )}
        <div className="campo"><label htmlFor="comprobante">{cash||historico?"Ticket o comprobante (obligatorio)":"Comprobante (PDF o foto, opcional)"}</label><input id="comprobante" name="comprobante" required={cash||historico} type="file" accept="application/pdf,image/*" /></div>
      </div>

      <fieldset className="campo">
        <legend>A qué facturas se aplica</legend>
        <div className="tarjetas">
          {facturas.filter(f=>(origen!=="boveda"||f.id===elegidaReserva?.factura_id)&&(!unDocumento||f.id===facturaCash)).map((f) => (
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
