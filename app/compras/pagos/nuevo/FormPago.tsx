"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { fechaTexto, pesos } from "@/lib/formato";
import { repartirPago, revisarPago, type PorPagar } from "@/lib/compras/pagos";
import { FORMAS_PAGO, NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/compras/proveedores";
import { registrarPago } from "../acciones";

export type FacturaParaPagar = PorPagar & { nombre: string; bloqueada: string | null };

/** El monto se reparte solo por fecha de pago; cada factura se puede ajustar a mano. */
export function FormPago({ proveedorId, facturas, forma, hoy, preseleccion }: {
  proveedorId: string; facturas: FacturaParaPagar[]; forma: FormaPago; hoy: string; preseleccion: string | null;
}) {
  const pagables = facturas.filter((f) => !f.bloqueada);
  const inicial = preseleccion ? String(pagables.find((f) => f.id === preseleccion)?.saldo ?? "") : "";
  const [monto, setMonto] = useState(inicial);
  // Si se llegó desde una factura, esa queda aplicada completa (y las demás en cero) hasta que se cambie el monto.
  const [manual, setManual] = useState<Record<string, string>>(() =>
    preseleccion && inicial ? Object.fromEntries(pagables.map((f) => [f.id, f.id === preseleccion ? inicial : ""])) : {});
  const numero = (t: string) => Number(t.replace(/[$\s,]/g, "")) || 0;
  const reparto = repartirPago(numero(monto), pagables);
  const aplicado = (id: string) => manual[id] ?? String(reparto.aplicaciones.find((a) => a.factura_id === id)?.monto ?? "");
  const aplicaciones = pagables.map((f) => ({ factura_id: f.id, monto: numero(aplicado(f.id)) }));
  const problema = revisarPago(numero(monto), aplicaciones, new Map(pagables.map((f) => [f.id, Number(f.saldo)])));

  return (
    <form action={registrarPago} className="seccion formulario">
      <input type="hidden" name="proveedor_id" value={proveedorId} />
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="monto">Monto pagado</label>
          <input id="monto" name="monto" inputMode="decimal" required value={monto} onChange={(e) => { setMonto(e.target.value); setManual({}); }} />
        </div>
        <div className="campo"><label htmlFor="fecha">Fecha del pago</label><input id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} required /></div>
        <div className="campo">
          <label htmlFor="forma">Forma</label>
          <select id="forma" name="forma" defaultValue={forma}>{FORMAS_PAGO.map((x) => <option key={x} value={x}>{NOMBRE_FORMA_PAGO[x]}</option>)}</select>
        </div>
        <div className="campo"><label htmlFor="cuenta_origen">Cuenta de origen</label><input id="cuenta_origen" name="cuenta_origen" placeholder="Ej. BBVA empresa" /></div>
        <div className="campo"><label htmlFor="referencia">Referencia o clave de rastreo</label><input id="referencia" name="referencia" /></div>
        <div className="campo"><label htmlFor="comprobante">Comprobante (PDF o foto, opcional)</label><input id="comprobante" name="comprobante" type="file" accept="application/pdf,image/*" /></div>
      </div>

      <fieldset className="campo">
        <legend>A qué facturas se aplica</legend>
        <div className="tarjetas">
          {facturas.map((f) => (
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

      {reparto.sobrante > 0 && !Object.keys(manual).length && <p className="aviso aviso-error">Sobran {pesos(reparto.sobrante)}: el monto pasa del saldo de las facturas.</p>}
      {problema && numero(monto) > 0 && <p className="saldo-nota" role="status">{problema}</p>}
      <BotonEnviar pendiente="Registrando…">Registrar pago</BotonEnviar>
    </form>
  );
}
