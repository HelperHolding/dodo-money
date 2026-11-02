import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { DOCUMENTOS, PRIORIDADES, puedeCrearTareas, type Prioridad, type TipoDocumento } from "@/lib/tareas";
import { crearTarea } from "../acciones";
import { leerDocumento, leerPersonas, type Persona } from "../datos";

export default async function NuevaTarea({ searchParams }: { searchParams: Promise<{ tipo?: string; id?: string; sucursal?: string; error?: string }> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeCrearTareas(perfil.rol)) redirect("/tareas");
  const tipo = p.tipo && Object.hasOwn(DOCUMENTOS, p.tipo) ? (p.tipo as TipoDocumento) : null;
  const doc = tipo && p.id ? await leerDocumento(supabase, tipo, p.id) : null;
  if (doc && "error" in doc) return <><EncabezadoPagina titulo="Nueva tarea" /><Aviso error={doc.error} /><Link href="/tareas">Volver</Link></>;
  const admin = perfil.rol === "admin";
  const { data: sucursales } = admin && !doc ? await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>() : { data: null };
  // Sucursal de la tarea: la del documento; el admin elige; los demás, la suya.
  const sucursal = doc ? doc.sucursal_id : admin ? (p.sucursal && p.sucursal !== "oficina" ? p.sucursal : null) : perfil.sucursal_id;
  let personas: Persona[];
  try { personas = await leerPersonas(supabase, sucursal); }
  catch { return <><EncabezadoPagina titulo="Nueva tarea" /><p className="aviso aviso-error">No se pudo consultar a las personas asignables. Vuelve a intentar en un momento.</p><Link href="/tareas">Volver</Link></>; }
  const aqui = `/tareas/nueva?${new URLSearchParams(Object.entries({ tipo: p.tipo, id: p.id, sucursal: p.sucursal }).filter(([, v]) => v) as [string, string][])}`;
  return <>
    <EncabezadoPagina titulo="Nueva tarea" descripcion={doc ? <>{DOCUMENTOS[tipo!]} · {doc.texto}</> : undefined} />
    <Aviso error={p.error} />
    {doc?.anulado && <p className="aviso aviso-error">Este documento está anulado o cancelado.</p>}
    {admin && !doc && <form className="barra-filtros" method="get" aria-label="Sucursal de la tarea">
      <label htmlFor="sucursal">Sucursal</label>
      <select id="sucursal" name="sucursal" defaultValue={p.sucursal ?? "oficina"}>
        <option value="oficina">Oficina</option>{sucursales?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      <button className="boton boton-secundario" type="submit">Elegir</button>
    </form>}
    <form action={crearTarea} className="formulario">
      <input type="hidden" name="volver_a" value={aqui} />
      <input type="hidden" name="sucursal_id" value={!doc && admin ? sucursal ?? "" : ""} />
      {doc && <><input type="hidden" name="documento_tipo" value={tipo!} /><input type="hidden" name="documento_id" value={p.id} /></>}
      <div className="campo"><label htmlFor="titulo">Qué hay que hacer</label><input id="titulo" name="titulo" required minLength={3} maxLength={200} defaultValue={doc?.texto ?? ""} /></div>
      <div className="campo"><label htmlFor="descripcion">Detalle</label><textarea id="descripcion" name="descripcion" rows={3} maxLength={4000} /></div>
      <div className="rejilla">
        <div className="campo"><label htmlFor="asignado_a">Asignar a</label>
          <select id="asignado_a" name="asignado_a" required defaultValue=""><option value="" disabled>Elige una persona</option>{personas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
        <div className="campo"><label htmlFor="prioridad">Prioridad</label>
          <select id="prioridad" name="prioridad" defaultValue="media">{(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}</select></div>
        <div className="campo"><label htmlFor="vence">Vence</label><input id="vence" name="vence" type="date" /></div>
      </div>
      {personas.length === 0 && <p className="aviso aviso-error">No hay personas activas a quienes puedas asignar esta tarea.</p>}
      <BotonEnviar>Crear tarea</BotonEnviar>
    </form>
    <Link href={doc ? doc.ruta : "/tareas"}>Cancelar</Link>
  </>;
}
