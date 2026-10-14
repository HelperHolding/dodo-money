"use client";

import { useMemo, useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { cuadre, pideVentas } from "@/lib/arqueo";
import { BILLETES, MONEDAS, claveBillete, claveMoneda, totalConteo } from "@/lib/denominaciones";
import { pesos } from "@/lib/formato";
import { NOMBRE_MOMENTO, type MomentoArqueo } from "@/lib/tipos";
import { registrarArqueo } from "./actions";

export function FormArqueo({
  fondoInicial, fondoDeMovimientos, retirosBoveda, momentoSugerido, momentosPosibles,pagosVentas=0,
}: { fondoInicial: number; fondoDeMovimientos: boolean; retirosBoveda: number; momentoSugerido: MomentoArqueo; momentosPosibles: MomentoArqueo[];pagosVentas?:number }) {
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [ventas, setVentas] = useState("");
  const [momento, setMomento] = useState<MomentoArqueo>(momentoSugerido);

  const contado = useMemo(() => totalConteo(conteo), [conteo]);
  const conVentas = pideVentas(momento);
  const { ventas: ventasNum, esperado, diferencia, estado } = cuadre({
    momento, fondo: fondoInicial, ventas: ventas === "" ? null : Number(ventas) || 0, retiros: retirosBoveda, contado,pagos:pagosVentas,
  });
  const veredicto =
    estado === "pendiente" ? (conVentas ? "Cuenta el efectivo y escribe las ventas" : "Cuenta el efectivo del cajero")
    : estado === "cuadra" ? "La caja cuadra"
    : estado === "faltante" ? `Faltan ${pesos(-diferencia)}`
    : `Sobran ${pesos(diferencia)}`;

  const fila = (clave: string, etiqueta: string, valor: number) => (
    <tr key={clave}>
      <td>{etiqueta}</td>
      <td>
        <input
          type="number" inputMode="numeric" min="0" step="1" name={clave}
          aria-label={`Cantidad de ${etiqueta}`}
          value={conteo[clave] ?? ""}
          onChange={(e) => setConteo({ ...conteo, [clave]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
        />
      </td>
      <td>{pesos((conteo[clave] ?? 0) * valor)}</td>
    </tr>
  );

  return (
    <form action={registrarArqueo} className="formulario-pagina">
      <input type="hidden" name="conteo" value={JSON.stringify(conteo)} />

      <section className="seccion" aria-labelledby="t-momento">
        <h2 id="t-momento">Momento</h2>
        <div className="acciones" role="radiogroup" aria-labelledby="t-momento">
          {momentosPosibles.map((m) => (
            <label key={m} className="acciones" style={{ gap: 8, minHeight: 48 }}>
              <input type="radio" name="momento" value={m} checked={m === momento} onChange={() => setMomento(m)} style={{ minHeight: 0, width: 20, height: 20 }} />
              {NOMBRE_MOMENTO[m]}
            </label>
          ))}
        </div>
      </section>

      <section className="seccion" aria-labelledby="t-conteo">
        <h2 id="t-conteo">Conteo del cajero</h2>
        <div className="conteo">
          <table>
            <thead><tr><th>Billetes</th><th>Cantidad</th><th>Importe</th></tr></thead>
            <tbody>{BILLETES.map((d) => fila(claveBillete(d), pesos(d).replace(".00", ""), d))}</tbody>
          </table>
          <table>
            <thead><tr><th>Monedas</th><th>Cantidad</th><th>Importe</th></tr></thead>
            <tbody>{MONEDAS.map((d) => fila(claveMoneda(d), d < 1 ? "50 ¢" : pesos(d).replace(".00", ""), d))}</tbody>
          </table>
        </div>
      </section>

      <section className="seccion" aria-labelledby="t-cuadre">
        <h2 id="t-cuadre">Cuadre del efectivo</h2>
        {conVentas ? (
          <div className="campo" style={{ maxWidth: 320 }}>
            <label htmlFor="ventas_efectivo">Ventas en efectivo del turno según Dodo IS</label>
            <input id="ventas_efectivo" name="ventas_efectivo" type="number" inputMode="decimal" min="0" step="0.01"
              required value={ventas} onChange={(e) => setVentas(e.target.value)} />
            <small>Reporte de ventas del turno, columna Efectivo.</small>
          </div>
        ) : (
          <p className="saldo-nota">Al inicio del turno todavía no hay ventas: en el cajero debe estar solo el fondo.</p>
        )}
        <div className="resultado" data-estado={estado} aria-live="polite">
          <div className="resultado-dato">
            <span>Fondo inicial {fondoDeMovimientos ? "(entregado desde la bóveda)" : "(fijo de la sucursal)"}</span>
            <strong>{pesos(fondoInicial)}</strong>
          </div>
          {conVentas && <div className="resultado-dato"><span>+ Ventas en efectivo</span><strong>{pesos(ventasNum)}</strong></div>}
          <div className="resultado-dato"><span>− Retiros a bóveda</span><strong>{pesos(retirosBoveda)}</strong></div>
          <div className="resultado-dato"><span>− Pagos desde efectivo de ventas</span><strong>{pesos(pagosVentas)}</strong></div>
          <div className="resultado-dato"><span>= Esperado</span><strong>{pesos(esperado)}</strong></div>
          <div className="resultado-dato"><span>Contado</span><strong>{pesos(contado)}</strong></div>
          <div className="resultado-veredicto">
            <strong>{veredicto}</strong>
          </div>
        </div>
        {(estado === "faltante" || estado === "sobrante") && (
          <div className="campo">
            <label htmlFor="explicacion">¿Qué pasó con la diferencia?</label>
            <textarea id="explicacion" name="explicacion" rows={2} required />
          </div>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-otros">
        <h2 id="t-otros">Otros métodos de pago</h2>
        {[
          ["tarjeta", "Tarjeta (cierre de terminal)"],
          ["app", "App o pago en línea"],
          ["rappi", "Rappi"],
        ].map(([clave, texto]) => (
          <fieldset key={clave} className="campo metodo-pago">
            <legend className="etiqueta">{texto}</legend>
            <div className="rejilla rejilla-corta">
              <div className="campo">
                <label htmlFor={`${clave}_real`}>Real</label>
                <input id={`${clave}_real`} name={`${clave}_real`} type="number" inputMode="decimal" min="0" step="0.01" />
              </div>
              <div className="campo">
                <label htmlFor={`${clave}_sistema`}>Dodo IS</label>
                <input id={`${clave}_sistema`} name={`${clave}_sistema`} type="number" inputMode="decimal" min="0" step="0.01" />
              </div>
            </div>
          </fieldset>
        ))}
        <div className="rejilla rejilla-corta">
          <div className="campo">
            <label htmlFor="transacciones">Transacciones</label>
            <input id="transacciones" name="transacciones" type="number" inputMode="numeric" min="0" step="1" />
          </div>
          <div className="campo">
            <label htmlFor="ticket_promedio">Ticket promedio</label>
            <input id="ticket_promedio" name="ticket_promedio" type="number" inputMode="decimal" min="0" step="0.01" />
          </div>
        </div>
      </section>

      <div className="acciones">
        <BotonEnviar pendiente="Guardando arqueo…"
          confirmar={contado === 0 ? "El conteo está en $0.00. ¿Guardar el arqueo así?" : undefined}>Guardar arqueo</BotonEnviar>
        <span className="saldo-nota">Después, quien recibe el turno lo confirma con su usuario.</span>
      </div>
    </form>
  );
}
