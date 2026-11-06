import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCorreos } from "@/lib/roles";
import { NOMBRE_ESTADO } from "@/lib/correos/tipos";
import { estadisticas } from "@/lib/correos/estadisticas";
import { fechaHoraMX } from "./formato";
import styles from "./correos.module.css";
import { esperandoN8n, leerCampanas, leerEnviosYEventos } from "./datos";

export default async function Campanas() {
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCorreos(perfil.rol);
  const [campanas, sinN8n] = await Promise.all([leerCampanas(supabase), esperandoN8n(supabase)]);
  const enviadas = await Promise.all(campanas.filter((c) => c.estado === "enviada").slice(0, 20).map(async (c) => {
    const { envios, eventos } = await leerEnviosYEventos(supabase, c.id); return [c.id, estadisticas(envios, eventos)] as const;
  }));
  const stats = Object.fromEntries(enviadas);
  return <>
    <header className={styles.cabecera}><h1>Campañas</h1>{edita && <Link className="boton" href="/correos/nueva">Nueva campaña</Link>}</header>
    {!campanas.length && <p>Aún no hay campañas.</p>}
    <div className={styles.tarjetas}>{campanas.map((c) => {
      const s = stats[c.id], espera = sinN8n && (c.estado === "enviando" || (c.estado === "programada" && c.programada_para && Date.parse(c.programada_para) < Date.now()));
      return <Link key={c.id} href={c.estado === "borrador" && edita ? `/correos/${c.id}/editar` : `/correos/${c.id}`} className={styles.tarjeta}>
        <span className={styles[c.estado]}>{NOMBRE_ESTADO[c.estado]}</span>
        <strong>{c.nombre}</strong><span>{c.asunto}</span>
        <small>{c.programada_para ? fechaHoraMX(c.programada_para) : "Sin programar"}</small>
        {s && <small>{Math.round(s.pctApertura * 100)} % aperturas · {Math.round(s.pctClic * 100)} % clics</small>}
        {espera && <small className={styles.alerta}>Esperando a n8n</small>}
      </Link>;
    })}</div>
  </>;
}
