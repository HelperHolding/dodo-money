"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Cajon } from "@/components/Cajon";
import { Icono } from "@/components/Icono";
import type { Alerta, DatosSucursal } from "@/lib/corporativo";
import { hora, pesos } from "@/lib/formato";
import { verSucursal } from "./actions";

export type FilaSemaforo = DatosSucursal & { alertas: readonly Alerta[] };

/** alerta = lo marca alertasDeSucursal; ok = sin alerta; neutro = dato informativo o en curso. */
type Estado = "alerta" | "ok" | "neutro";
type Celda = { titulo: string; valor: string; estado: Estado };

/** "1 abierto", "2 abiertos". */
const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const deAlerta = (f: FilaSemaforo, a: Alerta): Estado => (f.alertas.includes(a) ? "alerta" : "ok");
const avance = (f: FilaSemaforo, a: Alerta, hechas: number, total: number): Estado =>
  f.alertas.includes(a) ? "alerta" : hechas < total ? "neutro" : "ok";

/** Las mismas cifras de la tarjeta anterior, agrupadas como columnas del semáforo. */
function grupos(f: FilaSemaforo): { titulo: string; celdas: Celda[] }[] {
  return [
    { titulo: "Efectivo", celdas: [
      { titulo: "Turnos", valor: `${cuenta(f.turnosAbiertos, "abierto", "abiertos")} · ${cuenta(f.turnosCerrados, "cerrado", "cerrados")}`, estado: "neutro" },
      { titulo: "Arqueos", valor: pesos(f.diferenciaArqueos) + (f.arqueosDescuadrados ? ` · ${cuenta(f.arqueosDescuadrados, "descuadrado", "descuadrados")}` : ""), estado: deAlerta(f, "arqueos") },
      { titulo: "Pendientes", valor: String(f.pendientes), estado: deAlerta(f, "pendientes") },
      { titulo: "Salida", valor: pesos(f.deposito), estado: f.cierre ? deAlerta(f, "deposito") : "neutro" },
    ] },
    { titulo: "Cierre", celdas: [
      { titulo: "Cierre", valor: f.cierre ? hora(f.cierre.cerradoEn) : "Falta", estado: f.alertas.includes("cierre") ? "alerta" : f.cierre ? "ok" : "neutro" },
      { titulo: "Bóveda", valor: f.cierre ? pesos(f.cierre.bovedaDiferencia) : "—", estado: f.cierre ? deAlerta(f, "boveda") : "neutro" },
    ] },
    { titulo: "Checklists", celdas: [
      { titulo: "Masa", valor: `${f.masa.registradas}/${f.masa.total}${f.masa.fueraDeNorma ? ` · ${f.masa.fueraDeNorma} fuera` : ""}`, estado: avance(f, "masa", f.masa.registradas, f.masa.total) },
      { titulo: "Recorrido", valor: `${f.recorrido.hechos}/${f.recorrido.total}${f.recorrido.conFallas ? ` · ${cuenta(f.recorrido.conFallas, "falla", "fallas")}` : ""}`, estado: avance(f, "recorrido", f.recorrido.hechos, f.recorrido.total) },
      { titulo: "Rondas", valor: `${f.rondas.hechas}/${f.rondas.total}${f.rondas.conFallas ? ` · ${cuenta(f.rondas.conFallas, "falla", "fallas")}` : ""}`, estado: avance(f, "rondas", f.rondas.hechas, f.rondas.total) },
      { titulo: "Listas", valor: `${f.listas.hechas}/${f.listas.total}`, estado: avance(f, "listas", f.listas.hechas, f.listas.total) },
      { titulo: "Mermas", valor: f.mermasCerradas ? "Cerradas" : "Abiertas", estado: f.alertas.includes("mermas") ? "alerta" : f.mermasCerradas ? "ok" : "neutro" },
      { titulo: "Limpieza", valor: f.limpiezaProfunda ? "Sí" : "No", estado: f.alertas.includes("limpieza") ? "alerta" : f.limpiezaProfunda ? "ok" : "neutro" },
      { titulo: "Amasado", valor: f.amasadoFuera ? `${f.amasadoFuera} fuera` : "En rango", estado: deAlerta(f, "amasado") },
    ] },
    { titulo: "Caja chica", celdas: [
      { titulo: "Comprobantes", valor: f.sinComprobante ? `${f.sinComprobante} sin` : "Completos", estado: deAlerta(f, "comprobantes") },
      { titulo: "Gastos", valor: pesos(f.gastos), estado: "neutro" },
      { titulo: "Mermas", valor: String(f.mermas), estado: "neutro" },
      ...(f.porReponerEmpleados > 0 ? [{ titulo: "Por reponer", valor: pesos(f.porReponerEmpleados), estado: "neutro" as const }] : []),
    ] },
  ];
}

const ICONO = { alerta: "alerta", ok: "ok", neutro: "info" } as const;
const LECTURA = { alerta: "Revisar", ok: "En orden", neutro: "Informativo" } as const;

function Senal({ estado }: { estado: Estado }) {
  return <span className="senal" data-estado={estado}><Icono nombre={ICONO[estado]} etiqueta={LECTURA[estado]} /></span>;
}

/** Matriz de sucursales × controles del día. Tocar una sucursal abre su detalle completo a la derecha. */
export function SemaforoSucursales({ filas }: { filas: readonly FilaSemaforo[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const actual = filas.find((f) => f.id === abierta);
  // Columnas fijas: las de la primera sucursal sin "Por reponer" (es opcional y solo va en el detalle).
  const columnas = grupos(filas[0]).map((g) => ({ ...g, celdas: g.celdas.filter((c) => c.titulo !== "Por reponer") }));

  return (
    <>
      <div className="semaforo-contenedor">
        <table className="semaforo">
          <caption className="solo-lector">Estado del día por sucursal</caption>
          <thead>
            <tr>
              <th rowSpan={2} scope="col" className="semaforo-nombre">Sucursal</th>
              {columnas.map((g) => <th key={g.titulo} colSpan={g.celdas.length} scope="colgroup" className="semaforo-grupo">{g.titulo}</th>)}
            </tr>
            <tr>
              {columnas.map((g) => g.celdas.map((c, i) => <th key={`${g.titulo}-${c.titulo}`} scope="col" data-inicio={i === 0 ? "si" : undefined}>{c.titulo}</th>))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const celdas = grupos(f);
              const n = f.alertas.length;
              return (
                <tr key={f.id}>
                  <th scope="row" className="semaforo-nombre">
                    <button type="button" onClick={() => setAbierta(f.id)} aria-haspopup="dialog">
                      <strong>{f.nombre}</strong>
                      <span data-alerta={n ? "si" : undefined}>{n ? `${n} por revisar` : "Todo en orden"}</span>
                    </button>
                  </th>
                  {columnas.map((g, gi) => g.celdas.map((c, i) => {
                    const celda = celdas[gi].celdas.find((x) => x.titulo === c.titulo)!;
                    return (
                      <td key={`${g.titulo}-${c.titulo}`} data-inicio={i === 0 ? "si" : undefined} data-estado={celda.estado}>
                        <Senal estado={celda.estado} /><span>{celda.valor}</span>
                      </td>
                    );
                  }))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Cajon abierto={!!actual} alCerrar={() => setAbierta(null)} titulo={actual?.nombre ?? ""}
        antetitulo={actual ? (actual.alertas.length ? `${actual.alertas.length} por revisar` : "Todo en orden") : undefined}
        pie={actual && (
          <form action={verSucursal}>
            <input type="hidden" name="sucursal_id" value={actual.id} />
            <BotonEnviar pendiente="Abriendo…">Ver sucursal</BotonEnviar>
          </form>
        )}>
        {actual && grupos(actual).map((g) => (
          <section key={g.titulo} className="cajon-grupo" aria-label={g.titulo}>
            <h3>{g.titulo}</h3>
            <dl className="cajon-lista">
              {g.celdas.map((c) => (
                <div key={c.titulo} data-estado={c.estado}>
                  <dt><Senal estado={c.estado} />{c.titulo}</dt>
                  <dd>{c.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </Cajon>
    </>
  );
}
