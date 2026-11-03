import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, fechaTexto, hora } from "@/lib/formato";
import {
  ESTADOS, PRIORIDADES, REPITE, abierta, administra, clave, numeroDeClave, pideComentario, puedeAbrirDocumento, siguientes, textoCambio,
  type EstadoTarea, type Prioridad, type Quien, type Repite,
} from "@/lib/tareas";
import { actualizarTarea, comentarTarea, moverTarea } from "../acciones";
import { leerHilo, leerPersonas, leerTareas } from "../datos";

const BOTON: Record<EstadoTarea, string> = { por_hacer: "", en_curso: "Empezar", en_revision: "Mandar a revisión", hecho: "Aprobar", cancelada: "Cancelar tarea" };

export default async function DetalleTarea({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ numero: n }, avisos] = await Promise.all([params, searchParams]);
  const numero = numeroDeClave(n);
  if (!numero) notFound();
  const { supabase, perfil } = await obtenerPerfil();
  let t;
  try { [t] = await leerTareas(supabase, { numero }); }
  catch { return <p className="aviso aviso-error">No se pudo consultar la tarea. Vuelve a intentar en un momento.</p>; }
  if (!t) notFound();
  const quien: Quien = { id: perfil.id, rol: perfil.rol, sucursal_id: perfil.sucursal_id };
  const edita = abierta(t.estado) && administra(t, quien) && perfil.rol !== "corporativo";
  let hilo, personas;
  try { [hilo, personas] = await Promise.all([leerHilo(supabase, numero), edita ? leerPersonas(supabase, t.sucursal_id) : Promise.resolve([])]); }
  catch { return <p className="aviso aviso-error">No se pudo consultar el seguimiento de la tarea. Vuelve a intentar en un momento.</p>; }
  const pasos = siguientes(t, quien);
  const abrir = t.documento_tipo && t.documento_ruta && puedeAbrirDocumento(perfil.rol, t.documento_tipo);
  // Si el asignado actual ya no es elegible (baja), igual se muestra para poder reasignar.
  const opciones = personas.some((p) => p.id === t.asignado_a) ? personas : [{ id: t.asignado_a, nombre: `${t.asignado} (actual)`, rol: "" }, ...personas];
  return <>
    <EncabezadoPagina titulo={<>{clave(t.numero)} · {t.titulo}</>} descripcion={<>{ESTADOS[t.estado]} · {PRIORIDADES[t.prioridad]} · {t.sucursal ?? "Oficina"}</>} />
    <Link href="/tareas">Volver a mis tareas</Link>
    <Aviso {...avisos} />
    <section className="seccion">
      <dl className="tarjeta-datos">
        <dt>Asignada a</dt><dd>{t.asignado}{!t.asignado_activo && " · asignado inactivo"}</dd>
        <dt>Creada por</dt><dd>{t.creador ?? "Sistema"} · {fechaTexto(fechaMX(t.creada_en))}</dd>
        <dt>Vence</dt><dd>{t.vence ? fechaTexto(t.vence) : "Sin fecha"}</dd>
        {t.repite && <><dt>Se repite</dt><dd>{REPITE[t.repite]}</dd></>}
        {t.anterior_numero && <><dt>Viene de</dt><dd><Link href={`/tareas/${t.anterior_numero}`}>{clave(t.anterior_numero)}</Link></dd></>}
        {t.siguiente_numero && <><dt>Siguiente</dt><dd><Link href={`/tareas/${t.siguiente_numero}`}>{clave(t.siguiente_numero)}</Link></dd></>}
        {t.documento_texto && <><dt>Documento</dt><dd>{abrir ? <Link href={t.documento_ruta!}>{t.documento_texto}</Link> : t.documento_texto}{t.documento_anulado && " · documento anulado"}</dd></>}
        {t.descripcion && <><dt>Descripción</dt><dd className="texto-saltos">{t.descripcion}</dd></>}
        {t.motivo_cierre && <><dt>Motivo de cancelación</dt><dd>{t.motivo_cierre}</dd></>}
      </dl>
    </section>
    {pasos.length > 0 && <section className="seccion"><h2>Mover</h2><div className="acciones-tarea">
      {pasos.map((a) => (
        <form key={a} action={moverTarea} className="formulario">
          <input type="hidden" name="numero" value={t.numero} /><input type="hidden" name="revision" value={t.revision} /><input type="hidden" name="estado" value={a} />
          {pideComentario(t.estado, a) && <div className="campo"><label htmlFor={`c-${a}`}>{a === "cancelada" ? "Motivo de cancelación" : "Qué falta"}</label>
            <textarea id={`c-${a}`} name="comentario" rows={2} minLength={5} maxLength={4000} required /></div>}
          {a === "cancelada" && t.repite && <label className="casilla"><input type="checkbox" name="detener" value="1" defaultChecked /> Dejar de repetir (si la desmarcas, solo se salta esta vez y sale la siguiente)</label>}
          <BotonEnviar className={a === "cancelada" ? "boton boton-secundario" : "boton"}>{a === "en_curso" && t.estado === "en_revision" ? "Regresar" : BOTON[a]}</BotonEnviar>
        </form>
      ))}
    </div></section>}
    {edita && <section className="seccion"><h2>Editar</h2>
      <form action={actualizarTarea} className="formulario">
        <input type="hidden" name="numero" value={t.numero} /><input type="hidden" name="revision" value={t.revision} />
        <div className="campo"><label htmlFor="titulo">Título</label><input id="titulo" name="titulo" required minLength={3} maxLength={200} defaultValue={t.titulo} /></div>
        <div className="campo"><label htmlFor="descripcion">Descripción</label><textarea id="descripcion" name="descripcion" rows={3} maxLength={4000} defaultValue={t.descripcion ?? ""} /></div>
        <div className="rejilla">
          <div className="campo"><label htmlFor="asignado_a">Asignada a</label><select id="asignado_a" name="asignado_a" defaultValue={t.asignado_a}>{opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="campo"><label htmlFor="prioridad">Prioridad</label><select id="prioridad" name="prioridad" defaultValue={t.prioridad}>{(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}</select></div>
          <div className="campo"><label htmlFor="vence">Vence</label><input id="vence" name="vence" type="date" defaultValue={t.vence ?? ""} /></div>
          {t.origen === "manual" && <div className="campo"><label htmlFor="repite">Se repite</label>
            <select id="repite" name="repite" defaultValue={t.repite ?? ""}><option value="">No se repite</option>{(Object.keys(REPITE) as Repite[]).map((k) => <option key={k} value={k}>{REPITE[k]}</option>)}</select></div>}
        </div>
        <BotonEnviar>Guardar cambios</BotonEnviar>
      </form>
    </section>}
    <section className="seccion"><h2>Seguimiento</h2>
      <ol className="hilo-tarea">
        {hilo.map((e, i) => <li key={i} data-tipo={e.tipo}>
          <strong>{e.autor ?? "Sistema"}</strong> {e.tipo === "comentario" ? <span className="texto-saltos">{e.texto}</span> : textoCambio(e)}
          <small> · {fechaTexto(fechaMX(e.fecha))} {hora(e.fecha)}</small>
        </li>)}
      </ol>
      {perfil.rol !== "corporativo" && <form action={comentarTarea} className="formulario">
        <input type="hidden" name="numero" value={t.numero} />
        <div className="campo"><label htmlFor="comentario">Comentario</label><textarea id="comentario" name="comentario" rows={2} required maxLength={4000} /></div>
        <BotonEnviar pendiente="Enviando…">Comentar</BotonEnviar>
      </form>}
    </section>
  </>;
}
