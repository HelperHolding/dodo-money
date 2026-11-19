"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  CATEGORIAS_BI, EDADES_BI, leerFiltrosBI, ORIGENES_BI, PAGOS_BI, rangoRelativo, RELATIVAS, TIPOS_BI, urlBI, type FiltrosBI, type Relativa,
} from "@/lib/ventas/bi";
import { NOMBRE_CATEGORIA_BI, NOMBRE_DIA, NOMBRE_EDAD, NOMBRE_ORIGEN, NOMBRE_PAGO, NOMBRE_TIPO_BI } from "@/lib/ventas/biNombres";

type Opcion = { valor: string; texto: string };

/** Filtros que no son la fecha ni la comparación (los que cuenta «n activos»). */
const activos = (f: FiltrosBI) =>
  [f.suc.length, f.rfc, f.edad, f.canal, f.origen.length, f.tipo.length, f.dia.length, f.hora, f.cat.length, f.prod, f.pago.length].filter(Boolean).length;

function Casillas({ nombre, titulo, opciones, elegidas }: { nombre: string; titulo: string; opciones: readonly Opcion[]; elegidas: readonly string[] }) {
  return (
    <fieldset className="campo bi-casillas">
      <legend className="etiqueta">{titulo}</legend>
      <div>
        {opciones.map((o) => (
          <label key={o.valor}><input type="checkbox" name={nombre} value={o.valor} defaultChecked={elegidas.includes(o.valor)} />{o.texto}</label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Barra de filtros de Ventas BI. Navega sin recargar la página: el servidor recalcula el tablero y, mientras tanto,
 * el cuerpo se marca como cargando. Sin JavaScript el formulario GET funciona igual. En celular va plegada.
 */
export function FiltrosBI({ filtros, hoy, sucursales, razones, children }: {
  filtros: FiltrosBI; hoy: string; sucursales: readonly { id: string; nombre: string }[];
  razones: readonly { rfc: string; razon_social: string }[]; children: React.ReactNode;
}) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  // En computadora la barra empieza abierta; en celular, plegada.
  useEffect(() => { if (window.matchMedia("(min-width: 900px)").matches) setAbierto(true); }, []);
  const ir = (url: string) => iniciar(() => router.push(url, { scroll: false }));
  const n = activos(filtros);

  return (
    <>
      <details className="bi-filtros" open={abierto} onToggle={(e) => setAbierto(e.currentTarget.open)}>
        <summary>Filtros{n ? ` (${n} ${n === 1 ? "activo" : "activos"})` : ""}</summary>
        {/* La llave reinicia los campos cuando cambian los filtros aplicados (p. ej. con «Limpiar»). */}
        <Formulario key={urlBI(filtros)} filtros={filtros} hoy={hoy} sucursales={sucursales} razones={razones} cargando={cargando} ir={ir} />
      </details>
      <div className="bi-cuerpo" aria-busy={cargando}>{children}</div>
    </>
  );
}

function Formulario({ filtros: f, hoy, sucursales, razones, cargando, ir }: {
  filtros: FiltrosBI; hoy: string; sucursales: readonly { id: string; nombre: string }[];
  razones: readonly { rfc: string; razon_social: string }[]; cargando: boolean; ir: (url: string) => void;
}) {
  const [rel, setRel] = useState<string>(f.rel ?? "");
  const [rango, setRango] = useState({ desde: f.desde, hasta: f.hasta });
  const [canal, setCanal] = useState<string>(f.canal ?? "");

  const elegirRel = (valor: string) => {
    setRel(valor);
    if (valor) setRango(rangoRelativo(valor as Relativa, hoy));
  };
  const cambiarFecha = (campo: "desde" | "hasta", valor: string) => { setRel(""); setRango((r) => ({ ...r, [campo]: valor })); };

  const consultar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const sp: Record<string, string[]> = {};
    for (const [k, v] of datos.entries()) if (typeof v === "string" && v.trim()) (sp[k] ??= []).push(v.trim());
    // Con fecha relativa manda la relativa; con fechas a mano, el rango.
    if (rel) { delete sp.desde; delete sp.hasta; } else delete sp.rel;
    ir(urlBI(leerFiltrosBI(sp, hoy)));
  };

  const fechas = RELATIVAS.map(([valor, texto]) => ({ valor, texto }));
  return (
    <form action="/ventas/bi" method="get" className="bi-filtros-campos" onSubmit={consultar}>
      <div className="bi-filtros-fila">
        <label className="campo">Fecha<select name="rel" value={rel} onChange={(e) => elegirRel(e.target.value)}>
          <option value="">Rango personalizado</option>
          {fechas.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select></label>
        <label className="campo">Desde<input type="date" name="desde" max={hoy} value={rango.desde} onChange={(e) => cambiarFecha("desde", e.target.value)} /></label>
        <label className="campo">Hasta<input type="date" name="hasta" max={hoy} value={rango.hasta} onChange={(e) => cambiarFecha("hasta", e.target.value)} /></label>
        <label className="campo">Comparar contra<select name="comp" defaultValue={f.comp}>
          <option value="anterior">Periodo anterior</option>
          <option value="anio">Mismas fechas del año pasado</option>
        </select></label>
      </div>
      <div className="bi-filtros-fila">
        <label className="campo">Sucursal<select name="suc" multiple size={4} defaultValue={f.suc}>
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select><small>Sin elegir: todas. Ctrl o ⌘ para varias.</small></label>
        <label className="campo">Razón social<select name="rfc" defaultValue={f.rfc ?? ""}>
          <option value="">Todas</option>
          {razones.map((r) => <option key={r.rfc} value={r.rfc}>{r.razon_social}</option>)}
        </select></label>
        <label className="campo">Antigüedad<select name="edad" defaultValue={f.edad ?? ""}>
          <option value="">Todas</option>
          {Object.keys(EDADES_BI).map((k) => <option key={k} value={k}>{NOMBRE_EDAD[k]}</option>)}
        </select></label>
        <label className="campo">Canal<select name="canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">POS y Rappi</option>
          <option value="pos">POS (Dodo IS)</option>
          <option value="rappi">Rappi</option>
        </select></label>
      </div>
      <div className="bi-filtros-fila">
        <label className="campo">Hora<input name="hora" defaultValue={f.hora ? `${f.hora[0]}-${f.hora[1]}` : ""} placeholder="19-22" pattern="\d{1,2}-\d{1,2}" inputMode="numeric" /></label>
        <label className="campo">Producto<input name="prod" type="search" defaultValue={f.prod ?? ""} maxLength={80} placeholder="Pepperoni" /></label>
      </div>
      <Casillas nombre="dia" titulo="Día de la semana" elegidas={f.dia.map(String)} opciones={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ valor: String(d), texto: NOMBRE_DIA[d] }))} />
      {/* Rappi no tiene origen ni tipo de servicio propios: con «Canal = Rappi» esos filtros se ocultan. */}
      {canal !== "rappi" && <Casillas nombre="origen" titulo="Origen" elegidas={f.origen} opciones={ORIGENES_BI.map((o) => ({ valor: o, texto: NOMBRE_ORIGEN[o] }))} />}
      {canal !== "rappi" && <Casillas nombre="tipo" titulo="Tipo de servicio" elegidas={f.tipo} opciones={TIPOS_BI.map((t) => ({ valor: t, texto: NOMBRE_TIPO_BI[t] }))} />}
      <Casillas nombre="cat" titulo="Categoría" elegidas={f.cat} opciones={CATEGORIAS_BI.map((c) => ({ valor: c, texto: NOMBRE_CATEGORIA_BI[c] }))} />
      <Casillas nombre="pago" titulo="Método de pago" elegidas={f.pago} opciones={PAGOS_BI.map((p) => ({ valor: p, texto: NOMBRE_PAGO[p] }))} />
      <div className="acciones">
        <button className="boton" type="submit" disabled={cargando}>{cargando ? "Consultando…" : "Consultar"}</button>
        <button className="boton boton-secundario" type="button" disabled={cargando} onClick={() => ir("/ventas/bi")}>Limpiar</button>
      </div>
    </form>
  );
}
