import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, fechaTexto, hora } from "@/lib/formato";
import { NOMBRE_ROL } from "@/lib/roles";
import { ESTADOS, PRIORIDADES, TIPOS, clave, esSoporte, numeroDeClave, rutaInterna, siguientes, textoCambio, type Prioridad } from "@/lib/soporte";
import type { Rol } from "@/lib/tipos";
import { cambiarTicket, comentarTicket } from "../acciones";
import { leerHilo, leerResponsables, leerTickets, urlCaptura } from "../datos";

export default async function DetalleTicket({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ numero: n }, avisos] = await Promise.all([params, searchParams]);
  const numero = numeroDeClave(n);
  if (!numero) notFound();
  const { supabase, perfil } = await obtenerPerfil();
  let t;
  try { [t] = await leerTickets(supabase, numero); }
  catch { return <p className="aviso aviso-error">No se pudo consultar el ticket. Vuelve a intentar en un momento.</p>; }
  if (!t) notFound();
  const soporte = esSoporte(perfil.rol);
  let hilo, responsables, captura;
  try {
    [hilo, responsables, captura] = await Promise.all([
      leerHilo(supabase, numero), soporte ? leerResponsables(supabase) : Promise.resolve([]), t.captura ? urlCaptura(supabase, t.captura) : Promise.resolve(null),
    ]);
  } catch { return <p className="aviso aviso-error">No se pudo consultar el seguimiento del ticket. Vuelve a intentar en un momento.</p>; }
  // Abrir el ticket lo marca como leído (limpia el contador del menú).
  await supabase.rpc("marcar_ticket_leido", { p_numero: numero });
  const opcionesResponsable = !t.responsable || responsables.some((r) => r.id === t.responsable) ? responsables : [{ id: t.responsable, nombre: `${t.responsable_nombre ?? "Sin nombre"} (actual)` }, ...responsables];
  const puedeComentar = soporte || t.estado !== "descartado";
  return <>
    <EncabezadoPagina titulo={<>{clave(t.numero)} · {t.titulo}</>} descripcion={<>{TIPOS[t.tipo]} · {ESTADOS[t.estado]}{soporte && <> · {PRIORIDADES[t.prioridad]}</>}</>} />
    <Link href="/soporte">Volver al Help Desk</Link>
    <Aviso {...avisos} />
    <section className="seccion">
      <dl className="tarjeta-datos">
        <dt>Levantó</dt><dd>{t.creador} · {NOMBRE_ROL[t.rol_creador as Rol] ?? t.rol_creador} · {t.sucursal ?? "Oficina"} · {fechaTexto(fechaMX(t.creado_en))} {hora(t.creado_en)}</dd>
        <dt>Sección</dt><dd>{t.seccion}{soporte && t.ruta_origen && <> · {rutaInterna(t.ruta_origen) ? <Link href={t.ruta_origen}>{t.ruta_origen}</Link> : t.ruta_origen}</>}</dd>
        {t.tipo === "problema" && <><dt>¿Impide trabajar?</dt><dd>{t.bloquea ? "Sí" : "No"}</dd></>}
        <dt>Atiende</dt><dd>{t.responsable_nombre ?? "Sin asignar"}</dd>
        <dt>Descripción</dt><dd className="texto-saltos">{t.descripcion}</dd>
      </dl>
      {captura && <a href={captura} target="_blank" rel="noreferrer"><img className="soporte-captura" src={captura} alt="Captura de pantalla del ticket" /></a>}
      {t.captura && !captura && <p className="aviso">La captura no se pudo cargar.</p>}
    </section>
    {soporte && <section className="seccion"><h2>Atender</h2>
      <form action={cambiarTicket} className="formulario">
        <input type="hidden" name="numero" value={t.numero} /><input type="hidden" name="revision" value={t.revision} />
        <div className="rejilla">
          <div className="campo"><label htmlFor="estado">Estado</label>
            <select id="estado" name="estado" defaultValue={t.estado}>
              <option value={t.estado}>{ESTADOS[t.estado]} (actual)</option>
              {siguientes(t.estado).map((a) => <option key={a} value={a}>{ESTADOS[a]}</option>)}
            </select></div>
          <div className="campo"><label htmlFor="prioridad">Prioridad</label>
            <select id="prioridad" name="prioridad" defaultValue={t.prioridad}>{(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}</select></div>
          <div className="campo"><label htmlFor="responsable">Atiende</label>
            <select id="responsable" name="responsable" defaultValue={t.responsable ?? ""}><option value="">Sin asignar</option>{opcionesResponsable.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></div>
        </div>
        <div className="campo"><label htmlFor="respuesta">Respuesta para {t.creador} (obligatoria al resolver o descartar)</label>
          <textarea id="respuesta" name="comentario" rows={3} maxLength={4000} /></div>
        <BotonEnviar>Guardar</BotonEnviar>
      </form>
    </section>}
    <section className="seccion"><h2>Seguimiento</h2>
      <ol className="hilo-tarea">
        {hilo.map((e, i) => <li key={i} data-tipo={e.tipo} data-soporte={e.es_soporte || undefined} data-interna={e.interna || undefined}>
          <strong>{e.autor ?? "Sistema"}</strong>{e.es_agente
            ? <> <span className="insignia" data-tono="marca">Agente</span></>
            : e.es_soporte && <> <span className="insignia" data-tono="info">Soporte</span></>}
          {e.interna && <> <span className="insignia" data-tono="aviso">Nota interna (solo soporte)</span></>}{" "}
          {e.tipo === "comentario" ? <span className="texto-saltos">{e.texto}</span> : textoCambio(e)}
          <small> · {fechaTexto(fechaMX(e.fecha))} {hora(e.fecha)}</small>
        </li>)}
      </ol>
      {puedeComentar
        ? <form action={comentarTicket} className="formulario">
            <input type="hidden" name="numero" value={t.numero} />
            <div className="campo"><label htmlFor="comentario">{soporte ? "Comentario" : "Agregar información o responder"}</label><textarea id="comentario" name="comentario" rows={2} required maxLength={4000} /></div>
            <BotonEnviar pendiente="Enviando…">Comentar</BotonEnviar>
          </form>
        : <p className="aviso">Este ticket se descartó. Si sigue pasando, <Link href="/soporte/nuevo">levanta uno nuevo</Link>.</p>}
    </section>
  </>;
}
