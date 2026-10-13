import styles from './AdvertenciasPL.module.css';

export default function AdvertenciasPL({avisos}:{avisos:string[]}) {
  if(!avisos.length)return null;
  const grupos=new Map<string,string[]>();
  for(const aviso of avisos){
    const separador=aviso.indexOf(': ');
    const grupo=separador>0?aviso.slice(0,separador):'General';
    const texto=separador>0?aviso.slice(separador+2):aviso;
    grupos.set(grupo,[...(grupos.get(grupo)??[]),texto]);
  }
  return <details className={styles.panel}>
    <summary className={styles.resumen}>
      <span>Observaciones del reporte <span className={styles.contador}>{avisos.length}</span></span>
      <span className={styles.indicacion}>Ver detalle</span>
    </summary>
    <div className={styles.contenido}>
      <p className={styles.nota}>Pendientes de captura y notas de cálculo. Solo visibles en pantalla.</p>
      {[...grupos].map(([grupo,textos])=><section className={styles.grupo} key={grupo}>
        <h2>{grupo}</h2>
        <ul>{textos.map((texto,i)=><li key={i}>{texto}</li>)}</ul>
      </section>)}
    </div>
  </details>;
}
