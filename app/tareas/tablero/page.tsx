import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { SelectorVista } from "@/components/SelectorVista";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { leerVista } from "@/lib/vista";
import { MODULOS, PRIORIDADES, filtrar, leerFiltros, ordenPendientes, puedeCrearTareas, siguientes, veTablero, type Modulo, type Prioridad, type Quien } from "@/lib/tareas";
import { leerTareas } from "../datos";
import { TarjetaTarea } from "../TarjetaTarea";
import { TableroTareas } from "./TableroTareas";

type Params = Record<string, string | undefined>;

export default async function Tablero({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!veTablero(perfil.rol)) redirect("/tareas");
  let tareas;
  try { tareas = await leerTareas(supabase); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar las tareas. Revisa que la migración 20261102120000_tareas esté aplicada y vuelve a intentar.</p>; }
  const hoy = hoyCalendarioMX(), f = leerFiltros(p), vista = leerVista(p.vista);
  const quien: Quien = { id: perfil.id, rol: perfil.rol, sucursal_id: perfil.sucursal_id };
  const lista = filtrar(tareas, f, hoy).filter((t) => t.estado !== "cancelada");
  const personas = [...new Map(tareas.map((t) => [t.asignado_a, t.asignado])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sucursales = [...new Map(tareas.filter((t) => t.sucursal_id).map((t) => [t.sucursal_id!, t.sucursal!])).entries()];
  const aqui = `/tareas/tablero?${new URLSearchParams(Object.entries(p).filter(([k, v]) => v && !["ok", "error"].includes(k)) as [string, string][])}`;
  return <>
    <EncabezadoPagina titulo="Tablero de tareas" info="Todo el backlog que puedes ver. Arrastra una tarjeta o usa «Mover a»; regresar y cancelar se hacen desde el detalle."
      acciones={puedeCrearTareas(perfil.rol) && <Link className="boton" href="/tareas/nueva">Nueva tarea</Link>} />
    <Aviso ok={p.ok} error={p.error} />
    <form className="barra-filtros" aria-label="Filtros">
      {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
      <select name="persona" defaultValue={f.persona} aria-label="Persona"><option value="">Todas las personas</option>{personas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <select name="sucursal" defaultValue={f.sucursal} aria-label="Sucursal"><option value="">Todas las sucursales</option><option value="oficina">Oficina</option>{sucursales.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <select name="prioridad" defaultValue={f.prioridad} aria-label="Prioridad"><option value="">Toda prioridad</option>{(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}</select>
      <select name="modulo" defaultValue={f.modulo} aria-label="Módulo"><option value="">Todo módulo</option>{(Object.keys(MODULOS) as Modulo[]).map((k) => <option key={k} value={k}>{MODULOS[k]}</option>)}</select>
      <select name="origen" defaultValue={f.origen} aria-label="Origen"><option value="">Manual y automática</option><option value="manual">Manual</option><option value="automatica">Automática</option></select>
      <label><input type="checkbox" name="vencidas" value="1" defaultChecked={f.vencidas} /> Solo vencidas</label>
      <button className="boton boton-secundario" type="submit">Filtrar</button>
    </form>
    <SelectorVista ruta="/tareas/tablero" params={p} vista={vista} />
    {lista.length === 0 ? <EstadoVacio titulo="No hay tareas con estos filtros" />
      : vista === "lista"
        ? <div className="tarjetas">{ordenPendientes(lista, hoy).map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoy} rol={perfil.rol} />)}</div>
        : <TableroTareas tareas={lista} pasos={Object.fromEntries(lista.map((t) => [t.id, siguientes(t, quien)]))} volverA={aqui} hoy={hoy} />}
  </>;
}
