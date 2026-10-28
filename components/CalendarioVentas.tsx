"use client";

import { Icono } from "@/components/Icono";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { fechaTexto, pesos, pesosCortos } from "@/lib/formato";
import {
  alElegirDia, diasEntreFechas, mesDe, moverMes, periodosRapidos, rangoElegido, semanasDelMes, ventaDelRango, type Rango, type Seleccion,
} from "@/lib/ventas/calendario";

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const tituloMes = (anio: number, mes: number) => {
  const t = nombreMes.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Periodo de Ventas: una barra fija arriba (botones Hoy, Semana y Mes, periodo cargado, sucursal y botón del calendario)
 * y el calendario, plegado al abrir para que los números se vean sin bajar; se despliega para elegir otro rango.
 * En el calendario cada día muestra su venta. Sin botón intermedio: el primer toque marca el inicio,
 * el segundo (otro día = rango; el mismo día = solo ese día) recarga todo el tablero con ese periodo.
 * Esc o "Limpiar" cancelan una selección a medias.
 */
export function CalendarioVentas({ venta, periodo, hoy, maxDias, sucursal, sucursales, ruta = "/ventas" }: {
  venta: Record<string, number>;
  periodo: Rango;
  hoy: string;
  maxDias: number;
  sucursal: string | null;
  /** null = el usuario no elige sucursal (gerente). */
  sucursales: { id: string; nombre: string }[] | null;
  /** Página que se recarga con ?desde&hasta (la demo local usa otra). */
  ruta?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mes, setMes] = useState(mesDe(periodo.hasta));
  const cargado: Seleccion = { inicio: periodo.desde, fin: periodo.hasta };
  const [sel, setSel] = useState<Seleccion>(cargado);
  const [excede, setExcede] = useState(false);
  const rango = rangoElegido(sel);
  const dias = rango ? diasEntreFechas(rango) : 0;
  const resumen = rango ? ventaDelRango(venta, rango) : null;
  const esperando = Boolean(sel.inicio && !sel.fin);
  const esteMes = mesDe(hoy);
  const puedeAvanzar = mes.anio * 12 + mes.mes < esteMes.anio * 12 + esteMes.mes;
  const [abierto, setAbierto] = useState(false);
  const diasPeriodo = diasEntreFechas(periodo);
  const rapidos = periodosRapidos(hoy);

  const ir = (r: Rango, suc: string | null) => {
    const q = new URLSearchParams({ desde: r.desde, hasta: r.hasta });
    if (suc) q.set("sucursal", suc);
    iniciar(() => router.push(`${ruta}?${q}`));
  };

  const elegir = (dia: string) => {
    // Mientras carga el periodo anterior se ignoran los toques: el calendario se reinicia al llegar los datos.
    if (pendiente) return;
    const r = alElegirDia(sel, dia, maxDias);
    setSel(r.sel);
    setExcede(r.excede);
    if (r.cargar) ir(r.cargar, sucursal);
  };
  const limpiar = () => { setSel(cargado); setExcede(false); };

  // Esc cancela una selección a medias.
  useEffect(() => {
    if (!esperando) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") { setSel({ inicio: periodo.desde, fin: periodo.hasta }); setExcede(false); } };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [esperando, periodo.desde, periodo.hasta]);

  return (
    <>
    <div className="periodo-barra" aria-busy={pendiente || undefined}>
      <div className="segmentos periodo-rapidos" role="group" aria-label="Periodo rápido">
        {rapidos.map((r) => (
          <button key={r.clave} type="button" disabled={pendiente}
            aria-pressed={r.rango.desde === periodo.desde && r.rango.hasta === periodo.hasta}
            onClick={() => ir(r.rango, sucursal)}>{r.etiqueta}</button>
        ))}
      </div>
      <button type="button" className="periodo-actual" aria-expanded={abierto} aria-controls="calendario-periodo"
        title={abierto ? "Ocultar calendario" : "Cambiar periodo"} onClick={() => setAbierto(!abierto)}>
        <Icono nombre="calendario" tamano={20} />
        <span className="periodo-texto">
          <strong>{periodo.desde === periodo.hasta ? fechaTexto(periodo.desde) : `${fechaTexto(periodo.desde)} – ${fechaTexto(periodo.hasta)}`}</strong>
          {` · ${diasPeriodo} ${diasPeriodo === 1 ? "día" : "días"}`}
          {pendiente && <span className="periodo-cargando"> · Actualizando…</span>}
        </span>
        <span className="solo-lector">{abierto ? "Ocultar calendario" : "Cambiar periodo"}</span>
        <Icono nombre={abierto ? "arriba" : "abajo"} tamano={20} className="periodo-flecha" />
      </button>
      {sucursales && (
        <>
          <label htmlFor="sucursal" className="solo-lector">Sucursal</label>
          <select id="sucursal" className="periodo-sucursal" value={sucursal ?? ""} disabled={pendiente} onChange={(e) => ir(periodo, e.target.value || null)}>
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </>
      )}
    </div>
    <section id="calendario-periodo" className="seccion calendario" aria-label="Calendario del periodo" hidden={!abierto}>
      <div className="calendario-cabecera">
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}><Icono nombre="izquierda" tamano={22} /></button>
        <h2>{tituloMes(mes.anio, mes.mes)}</h2>
        <button type="button" className="boton-icono calendario-flecha" aria-label="Mes siguiente" disabled={!puedeAvanzar} onClick={() => setMes(moverMes(mes, 1))}><Icono nombre="derecha" tamano={22} /></button>
      </div>

      <div className="calendario-rejilla" role="grid" aria-busy={pendiente || undefined}>
        {DIAS.map((d) => <span key={d} className="calendario-dia-semana" role="columnheader">{d}</span>)}
        {semanasDelMes(mes.anio, mes.mes).flat().map((dia, i) => {
          if (!dia) return <span key={`h${i}`} aria-hidden="true" />;
          const monto = venta[dia];
          const extremo = rango && (dia === rango.desde || dia === rango.hasta);
          const dentro = rango && dia > rango.desde && dia < rango.hasta;
          return (
            <button key={dia} type="button" className="calendario-dia" disabled={dia > hoy}
              data-estado={extremo ? "extremo" : dentro ? "dentro" : undefined} data-vacio={monto === undefined ? "si" : undefined}
              data-hoy={dia === hoy ? "si" : undefined} aria-current={dia === hoy ? "date" : undefined}
              aria-pressed={Boolean(extremo || dentro)}
              aria-label={`${fechaTexto(dia)}: ${monto === undefined ? "sin ventas importadas" : pesos(monto)}`}
              onClick={() => elegir(dia)}>
              <span className="calendario-numero">{Number(dia.slice(8))}</span>
              <span className="calendario-venta">{monto === undefined ? "—" : pesosCortos(monto)}</span>
            </button>
          );
        })}
      </div>

      <div className="calendario-pie">
        <p aria-live="polite">
          {esperando && rango ? (
            <>
              <strong>Desde {fechaTexto(rango.desde)}</strong>
              <span className="saldo-nota"> · Selecciona otro día para el rango, o toca este de nuevo para ver solo ese día.</span>
            </>
          ) : rango && resumen ? (
            <>
              <strong>{rango.desde === rango.hasta ? fechaTexto(rango.desde) : `${fechaTexto(rango.desde)} al ${fechaTexto(rango.hasta)}`}</strong>
              {` · ${dias} ${dias === 1 ? "día" : "días"} · ${pesos(resumen.total)}`}
              {pendiente && <span className="saldo-nota"> · Actualizando…</span>}
            </>
          ) : "Toca un día del calendario."}
        </p>
        {excede && <p className="alerta-texto" role="alert">El periodo puede ser de hasta {maxDias} días. Elige un día más cercano.</p>}
        {esperando && <button type="button" className="boton boton-fantasma boton-compacto" onClick={limpiar}>Limpiar</button>}
      </div>
    </section>
    </>
  );
}
