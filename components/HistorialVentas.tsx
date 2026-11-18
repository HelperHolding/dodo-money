"use client";

import { useState, useTransition } from "react";
import { LineaHistorial } from "@/components/LineaHistorial";
import { ventaHistorial } from "@/app/ventas/historialAcciones";
import { historialVentas, urlDashboard, type ParametrosDashboard } from "@/lib/ventas/inicio";

type Modo = "semanal" | "mensual" | "anual";
type Alcance = "sucursal" | "red";
const MODOS: readonly [Modo, string][] = [["semanal", "Semanal"], ["mensual", "Mensual"], ["anual", "Anual"]];

/**
 * Historial de ventas del inicio. Cambiar de periodo es instantáneo: se reagrupan en el navegador los mismos días.
 * Cambiar de alcance (esta sucursal / toda la red) pide solo esos días al servidor, una vez; mientras llegan,
 * solo la gráfica se ve cargando. La URL se actualiza sin recargar, para compartir o volver a la misma vista.
 */
export function HistorialVentas({ ruta, parametros, hasta, sucursal, nombreSucursal, ventaInicial }: {
  ruta: string; parametros: ParametrosDashboard; hasta: string; sucursal: string | null; nombreSucursal: string;
  ventaInicial: Record<string, number>;
}) {
  const [modo, setModo] = useState<Modo>(parametros.hist as Modo);
  const [alcance, setAlcance] = useState<Alcance>(parametros.alcance as Alcance);
  const [ventas, setVentas] = useState<Partial<Record<Alcance, Record<string, number>>>>({ [parametros.alcance as Alcance]: ventaInicial });
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();

  const marcar = (cambios: Partial<ParametrosDashboard>) =>
    window.history.replaceState(null, "", `${urlDashboard(ruta, { ...parametros, hist: modo, alcance }, cambios)}#inicio-historial`);

  const cambiarModo = (m: Modo) => { setModo(m); marcar({ hist: m }); };
  const cambiarAlcance = (a: Alcance) => {
    setAlcance(a); setError(null); marcar({ alcance: a });
    if (ventas[a]) return;
    iniciar(async () => {
      try {
        const venta = await ventaHistorial(a === "red" ? null : sucursal);
        setVentas((previas) => ({ ...previas, [a]: venta }));
      } catch {
        setError("No se pudo cargar el historial. Intenta de nuevo.");
      }
    });
  };

  const venta = ventas[alcance];
  return (
    <section className="inicio-historial" id="inicio-historial" aria-labelledby="inicio-historial-titulo" aria-busy={cargando}>
      <div className="inicio-historial-cabecera">
        <h2 id="inicio-historial-titulo">Historial de ventas</h2>
        {sucursal && (
          <div className="segmentos" role="group" aria-label="Alcance del historial">
            {(["sucursal", "red"] as const).map((a) => (
              <button key={a} type="button" aria-pressed={a === alcance} onClick={() => cambiarAlcance(a)}>{a === "red" ? "Toda la red" : "Esta sucursal"}</button>
            ))}
          </div>
        )}
      </div>
      {error ? <p className="aviso aviso-error">{error}</p>
        : !venta ? <p className="vacio">Cargando historial…</p>
        : <LineaHistorial titulo={`Venta con IVA, ${alcance === "red" ? "toda la red" : nombreSucursal}`} puntos={historialVentas(venta, hasta, modo)} />}
      <div className="segmentos inicio-historial-modo" role="group" aria-label="Periodo del historial">
        {MODOS.map(([m, texto]) => (
          <button key={m} type="button" aria-pressed={m === modo} onClick={() => cambiarModo(m)}>{texto}</button>
        ))}
      </div>
    </section>
  );
}
