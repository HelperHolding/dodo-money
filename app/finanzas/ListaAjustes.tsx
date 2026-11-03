import { pesos } from "@/lib/formato";
import type { ReactNode } from "react";
import { lineaAjuste, type AjustePL } from "@/lib/finanzas/ajustes";

/** "Ajustes del periodo": en pantalla una tabla con la nota (y "Anular" para admin); en el PDF, una línea por ajuste. */
export function ListaAjustes({ lista, conSucursal, impresa = false, anular }: {
  lista: readonly AjustePL[]; conSucursal: boolean; impresa?: boolean; anular?: (a: AjustePL) => ReactNode;
}) {
  if (!lista.length) return null;
  if (impresa) return (
    <section className="seccion pl-ajustes-impresos">
      <p className="saldo-nota"><strong>Ajustes del periodo</strong> (el real no cambia)</p>
      {lista.map((a) => <p key={a.id} className="saldo-nota">{lineaAjuste(a, conSucursal)}</p>)}
    </section>
  );
  return (
    <section className="seccion">
      <h2>Ajustes del periodo</h2>
      <p className="saldo-nota">El real no cambia: Ajuste y Ajustado muestran el P&L sin estos montos. Meta y Diferencia comparan contra el real.</p>
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas">
          <thead><tr>
            {conSucursal && <th>Sucursal</th>}<th>Renglón</th><th>Regla</th><th className="monto">Real</th><th className="monto">Ajuste</th><th className="monto">Ajustado</th><th>Nota</th>{anular && <th />}
          </tr></thead>
          <tbody>{lista.map((a) => (
            <tr key={a.id}>
              {conSucursal && <td data-label="Sucursal">{a.sucursal}</td>}
              <td data-label="Renglón">{a.nombre}</td>
              <td data-label="Regla">{a.regla}{a.sinEfecto && " (sin efecto)"}</td>
              <td data-label="Real" className="monto">{pesos(a.real)}</td>
              <td data-label="Ajuste" className="monto">{a.sinEfecto ? "—" : pesos(a.ajuste)}</td>
              <td data-label="Ajustado" className="monto">{pesos(a.ajustado)}</td>
              <td data-label="Nota">{a.nota}</td>
              {anular && <td data-label="">{anular(a)}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
