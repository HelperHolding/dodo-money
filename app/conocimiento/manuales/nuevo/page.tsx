import {redirect} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import {Formulario} from '@/app/activos/Formulario';
import {CamposManual} from '../../CamposManual';
import {guardarManual} from '../../acciones';
export default async function Nuevo(){const {perfil}=await obtenerPerfil();if(perfil.rol!=='admin')redirect('/conocimiento');return <><h1>Nuevo manual</h1><Formulario accion={guardarManual} texto="Guardar manual"><CamposManual/></Formulario></>;}
