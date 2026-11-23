import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { obtenerPerfil } from "@/lib/contexto";
import { ESTADOS, NOMBRES_SECCION, PRIORIDADES, TIPOS, enTablero, esSoporte, filtrar, type Filtros } from "@/lib/soporte";
import { leerTickets } from "./datos";
import { TableroSoporte } from "./TableroSoporte";
import { TarjetaTicket } from "./TarjetaTicket";

type Params = Filtros & { vista?: string; ok?: string; error?: string };

export default async function Soporte({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  let tickets;
  try { tickets = await leerTickets(supabase); }
  catch { return <p className="aviso aviso-error">No se pudo consultar el Help Desk. Revisa que la migración 20261123120000_soporte esté aplicada y vuelve a intentar.</p>; }
  const nuevo = <Link className="boton" href="/soporte/nuevo">Reportar</Link>;

  if (!esSoporte(perfil.rol)) {
    const mios = tickets.filter((t) => t.creado_por === perfil.id);
    return <>
      <EncabezadoPagina titulo="Mis tickets" info="Lo que has reportado y las respuestas de soporte." acciones={nuevo} />
      <Aviso ok={p.ok} error={p.error} />
      {mios.length === 0
        ? <EstadoVacio titulo="Aún no levantas tickets" descripcion="Si algo no funciona o se te ocurre una mejora, repórtalo aquí." accion={nuevo} />
        : <div className="tarjetas">{mios.map((t) => <TarjetaTicket key={t.id} t={t} soporte={false} />)}</div>}
    </>;
  }

  const lista = p.vista === "lista";
  const f: Filtros = { tipo: p.tipo, estado: p.estado, seccion: p.seccion, prioridad: p.prioridad, sucursal: p.sucursal, q: p.q };
  const ahora = Date.now();
  const sucursales = [...new Set(tickets.map((t) => t.sucursal ?? "Oficina"))].sort();
  const filtrados = filtrar(tickets, f);
  const opciones = (nombre: keyof Filtros, etiqueta: string, valores: [string, string][]) => (
    <div className="campo"><label htmlFor={nombre}>{etiqueta}</label>
      <select id={nombre} name={nombre} defaultValue={f[nombre] ?? ""}><option value="">Todos</option>{valores.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
  );
  return <>
    <EncabezadoPagina titulo="Help Desk" info="Tickets de todo el equipo. Arrastra o mueve las tarjetas; para resolver o descartar entra al ticket y escribe la respuesta." acciones={nuevo} />
    <Aviso ok={p.ok} error={p.error} />
    <nav className="accesos" aria-label="Vista">
      <Link href="/soporte" aria-current={!lista ? "page" : undefined}>Tablero</Link>
      <Link href="/soporte?vista=lista" aria-current={lista ? "page" : undefined}>Lista</Link>
    </nav>
    <form className="formulario filtros-soporte" method="get">
      <input type="hidden" name="vista" value={lista ? "lista" : ""} />
      <div className="campo"><label htmlFor="q">Buscar</label><input id="q" name="q" defaultValue={f.q ?? ""} placeholder="HD-14 o texto" /></div>
      {opciones("tipo", "Tipo", Object.entries(TIPOS))}
      {lista && opciones("estado", "Estado", Object.entries(ESTADOS))}
      {opciones("prioridad", "Prioridad", Object.entries(PRIORIDADES))}
      {opciones("seccion", "Sección", NOMBRES_SECCION.map((s): [string, string] => [s, s]))}
      {opciones("sucursal", "Sucursal", sucursales.map((s): [string, string] => [s, s]))}
      <button className="boton boton-secundario" type="submit">Filtrar</button>
    </form>
    {lista
      ? (filtrados.length === 0 ? <EstadoVacio titulo="Sin tickets con esos filtros" /> : <div className="tarjetas">{filtrados.map((t) => <TarjetaTicket key={t.id} t={t} soporte />)}</div>)
      : <TableroSoporte tickets={filtrados.filter((t) => enTablero(t, ahora))} />}
  </>;
}
