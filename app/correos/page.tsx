import Link from "next/link";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { NOMBRE_ESTADO } from "@/lib/correos/tipos";
import { TONO_ESTADO } from "@/lib/correos/presentacion";
import { estadisticas } from "@/lib/correos/estadisticas";
import { fechaHoraMX } from "./formato";
import styles from "./correos.module.css";
import { esperandoN8n, leerCampanas, leerEnviosYEventos } from "./datos";

/** Campañas: tarjetas con estado, nombre, asunto, fecha y, en las enviadas, aperturas y clics. */
export default async function Campanas() {
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCorreos(perfil.rol);
  const [campanas, sinN8n] = await Promise.all([leerCampanas(supabase), esperandoN8n(supabase)]);
  const enviadas = await Promise.all(campanas.filter((c) => c.estado === "enviada").slice(0, 20).map(async (c) => {
    const { envios, eventos } = await leerEnviosYEventos(supabase, c.id); return [c.id, estadisticas(envios, eventos)] as const;
  }));
  const stats = Object.fromEntries(enviadas);
  return <>
    <EncabezadoPagina titulo="Campañas" descripcion="Correos de marketing a la base de contactos o a una etiqueta."
      acciones={edita && <Link className="boton" href="/correos/nueva">Nueva campaña</Link>} />
    {!campanas.length ? <EstadoVacio titulo="Aún no hay campañas" descripcion={edita ? "Crea la primera con «Nueva campaña»." : undefined} />
      : <div className={styles.tarjetas}>{campanas.map((c) => {
        const s = stats[c.id], espera = sinN8n && (c.estado === "enviando" || (c.estado === "programada" && c.programada_para && Date.parse(c.programada_para) < Date.now()));
        return <Link key={c.id} href={c.estado === "borrador" && edita ? `/correos/${c.id}/editar` : `/correos/${c.id}`} className={styles.tarjeta}>
          <span className="estado" data-tono={TONO_ESTADO[c.estado]}>{NOMBRE_ESTADO[c.estado]}</span>
          <strong className={styles.nombre}>{c.nombre}</strong>
          <span className={styles.asunto}>{c.asunto}</span>
          <small>{c.programada_para ? fechaHoraMX(c.programada_para) : "Sin programar"}</small>
          {s && <span className={styles.mini}>
            <span><strong>{Math.round(s.pctApertura * 100)} %</strong> aperturas</span>
            <span><strong>{Math.round(s.pctClic * 100)} %</strong> clics</span>
            <span><strong>{s.destinatarios.toLocaleString("es-MX")}</strong> enviados</span>
          </span>}
          {espera && <span className="estado" data-tono="alerta">Esperando a n8n</span>}
        </Link>;
      })}</div>}
  </>;
}
