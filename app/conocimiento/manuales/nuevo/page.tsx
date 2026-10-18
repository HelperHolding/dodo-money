import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {redirect} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {Formulario} from '@/app/activos/Formulario';
import {CamposManual} from '../../CamposManual';
import {guardarManual} from '../../acciones';
export default async function Nuevo(){const {perfil}=await obtenerPerfil();if(perfil.rol!=='admin')redirect('/conocimiento');return <><EncabezadoPagina titulo="Nuevo manual"/><Formulario accion={guardarManual} texto="Guardar manual"><CamposManual/></Formulario></>;}
