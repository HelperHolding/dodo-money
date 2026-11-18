import styles from "../baja.module.css";
import { darDeBaja } from "./acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Darse de baja · Dodo Pizza", robots: { index: false } };

/** Pública. Abrirla no da de baja (los antivirus abren enlaces): hay que pulsar el botón. */
export default async function Baja({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ estado?: string }> }) {
  const { token } = await params, { estado } = await searchParams;
  return <main className={styles.pagina}><section className={styles.tarjeta}>
    <h1>Dodo Pizza</h1>
    {estado === "listo" ? <p>Listo. Ya no te mandaremos estos correos.</p>
      : estado === "invalido" ? <p>Este enlace no es válido. Si quieres darte de baja, responde a cualquiera de nuestros correos.</p>
      : <><p>¿Ya no quieres recibir nuestros correos?</p>
        <form action={darDeBaja}><input type="hidden" name="token" value={token} /><button type="submit" className={styles.boton}>Darme de baja</button></form></>}
  </section></main>;
}
