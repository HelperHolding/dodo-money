import { redirect } from "next/navigation";
import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { FormBanregio } from "./FormBanregio";
import styles from "../banca.module.css";

export default async function ImportarBanregio(){
  const {perfil}=await obtenerPerfil();
  if(perfil.rol!=="admin") redirect("/banca?vista=banregio");
  return <div className={styles.pagina}><EncabezadoPagina titulo="Importar Banregio" descripcion="Sube el reporte de movimientos en Excel. Primero se revisa; nada se guarda hasta confirmar." acciones={<Link className="boton boton-secundario" href="/banca?vista=banregio">Volver a Banregio</Link>}/><FormBanregio/></div>;
}
