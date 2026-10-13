import Image from 'next/image';
import Link from 'next/link';
import Volver from '@/components/Volver404';
import styles from './not-found.module.css';

export default function NotFound() {
  return <main className={styles.pagina}>
    <header className={styles.encabezado}>
      <Link href="/" className={styles.marca} aria-label="DODO MX, ir al inicio">
        <Image src="/logo-dodo.png" width={36} height={36} alt="" />
        <span>DODO MX</span>
      </Link>
      <span className={styles.etiqueta}>Tu operación, en un solo lugar</span>
    </header>
    <section className={styles.contenido} aria-labelledby="titulo-404">
      <div className={styles.numero} aria-hidden="true">
        <span>4</span><div className={styles.logo}><Image src="/logo-dodo.png" width={160} height={160} alt="" priority /></div><span>4</span>
      </div>
      <p className={styles.codigo}>Página no encontrada</p>
      <h1 id="titulo-404">Esta página se salió de la ruta.</h1>
      <p className={styles.descripcion}>El enlace puede haber cambiado o la dirección estar incompleta. Vamos a llevarte de vuelta.</p>
      <div className={styles.acciones}>
        <Link href="/" className={styles.inicio}>Ir al inicio <span aria-hidden="true">→</span></Link>
        <Volver className={styles.volver} />
      </div>
      <p className={styles.ayuda}>Si abriste un enlace guardado, busca el registro desde su módulo.</p>
    </section>
    <footer className={styles.pie}>DODO MX <span aria-hidden="true">·</span> Error 404</footer>
  </main>;
}
