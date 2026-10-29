"use client";
import { useState } from "react";
import Link from "next/link";
import { Icono } from "@/components/Icono";
import { mesDe, moverMes, semanasDelMes } from "@/lib/ventas/calendario";
import { fechaActivo } from "@/lib/activos";
import { ESTADOS, FILTROS_ESTADO, ORIGENES, TIPOS, filtrarFilas, type FilaCumplimiento, type FiltroEstado, type TipoObligacion } from "@/lib/cumplimiento";

const tipoTexto = (f: FilaCumplimiento) => f.origen === "obligacion" ? TIPOS[f.tipo as TipoObligacion] : f.origen === "mantenimiento" ? (f.tipo === "preventivo" ? "Preventivo" : "Correctivo") : "Servicio";

/** Calendario mensual de todo lo que hay que cumplir. Las cumplidas se pintan en su fecha real; lo demás, en su vencimiento. */
export function CalendarioCumplimiento({ filas, hoy, inicial, ambitos }: {
  filas: FilaCumplimiento[]; hoy: string; inicial: { origen: string; estado: FiltroEstado; ambito: string }; ambitos: { valor: string; nombre: string }[];
}) {
  const [mes, setMes] = useState(mesDe(hoy));
  const [dia, setDia] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(inicial);
  const periodo = `${mes.anio}-${String(mes.mes).padStart(2, "0")}`;
  const titulo = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(mes.anio, mes.mes - 1, 1)));
  const filtradas = filtrarFilas(filas, filtro);
  const delMes = filtradas.filter((f) => f.fecha.startsWith(periodo)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo) || a.referencia_id.localeCompare(b.referencia_id));
  const lista = dia ? delMes.filter((f) => f.fecha === dia) : delMes;
  const cambiarMes = (pasos: number) => { setMes(moverMes(mes, pasos)); setDia(null); };
  const cambiar = (c: keyof typeof filtro, v: string) => { setFiltro({ ...filtro, [c]: v } as typeof filtro); setDia(null); };
  return <section className="seccion activos-calendario" aria-label="Calendario de cumplimiento">
    <div className="calendario-cabecera"><button className="boton-icono" type="button" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}><Icono nombre="izquierda" /></button><h2>{titulo}</h2><button className="boton-icono" type="button" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}><Icono nombre="derecha" /></button></div>
    <div className="acciones">
      <button className="boton boton-secundario" type="button" onClick={() => { setMes(mesDe(hoy)); setDia(hoy); }}>Hoy</button>
      <button className="boton boton-secundario" type="button" onClick={() => setDia(null)} aria-pressed={!dia}>Ver todo el mes</button>
      <label className="campo">Origen<select value={filtro.origen} onChange={(e) => cambiar("origen", e.target.value)}><option value="">Todos</option>{Object.entries(ORIGENES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <label className="campo">Estado<select value={filtro.estado} onChange={(e) => cambiar("estado", e.target.value)}>{Object.entries(FILTROS_ESTADO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      {ambitos.length > 0 && <label className="campo">Sucursal o razón social<select value={filtro.ambito} onChange={(e) => cambiar("ambito", e.target.value)}><option value="">Todas</option>{ambitos.map((a) => <option key={a.valor} value={a.valor}>{a.nombre}</option>)}</select></label>}
    </div>
    <p className="saldo-nota">{delMes.length} en el mes · {filtradas.filter((f) => f.estado === "vencida").length} vencidas con estos filtros. Las cumplidas aparecen en su fecha real; lo demás, en su vencimiento.</p>
    <div className="activos-mes">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span className="activos-semana" key={d}>{d}</span>)}{semanasDelMes(mes.anio, mes.mes).flat().map((fecha, i) => {
      if (!fecha) return <span key={`vacio-${i}`} aria-hidden="true" />;
      const eventos = delMes.filter((f) => f.fecha === fecha), vencidas = eventos.filter((f) => f.estado === "vencida").length;
      return <button className="activos-dia" key={fecha} type="button" aria-pressed={dia === fecha} aria-current={fecha === hoy ? "date" : undefined} aria-label={`${fechaActivo(fecha)}: ${eventos.length} pendientes de cumplimiento${vencidas ? `, ${vencidas} vencidas` : ""}`} data-vencido={vencidas > 0 || undefined} onClick={() => setDia(dia === fecha ? null : fecha)}><strong>{Number(fecha.slice(8))}</strong>{eventos.length > 0 && <><span>{eventos.length}</span><small className="activos-dia-nombres">{eventos.slice(0, 2).map((f) => f.titulo).join(" · ")}{eventos.length > 2 ? " · …" : ""}</small></>}</button>;
    })}</div>
    <h3 aria-live="polite">{dia ? `Del ${fechaActivo(dia)}` : "Del mes"} · {lista.length}</h3>
    {!lista.length ? <p>No hay nada {dia ? "para este día" : "para este mes"} con los filtros seleccionados.</p> : <div className="tarjetas">{lista.map((f) =>
      <article className="tarjeta" key={`${f.origen}-${f.referencia_id}-${f.vence}`} data-alerta={f.estado === "vencida" ? "si" : undefined}>
        <div className="tarjeta-encabezado"><div><h3><Link href={f.ruta}>{f.titulo}</Link></h3><p>{ORIGENES[f.origen]} · {tipoTexto(f)}{f.ambito ? ` · ${f.ambito}` : ""}</p></div>
          <span className="insignia" data-tono={ESTADOS[f.estado].tono}>{ESTADOS[f.estado].texto}</span></div>
        <dl className="tarjeta-datos">
          {f.detalle && <><dt>Detalle</dt><dd>{f.detalle}</dd></>}
          <dt>Fecha</dt><dd>{fechaActivo(f.fecha)}{f.fecha !== f.vence ? ` · vencía ${fechaActivo(f.vence)}` : ""}</dd>
          {(f.falta_evidencia || (f.falta_factura && f.estado !== "pendiente" && f.estado !== "por_vencer")) && <><dt>Falta</dt><dd>{[f.falta_evidencia && "evidencia", f.falta_factura && "factura"].filter(Boolean).join(" y ")}</dd></>}
        </dl>
      </article>)}</div>}
  </section>;
}
