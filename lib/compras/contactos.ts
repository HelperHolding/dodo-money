export type ContactoProveedor = {id:string;nombre:string;puesto:string|null;telefono:string|null;correo:string|null;activo:boolean};
export function leerContacto(valor:(campo:string)=>string) {
 const nombre=valor('nombre').trim(),puesto=valor('puesto').trim(),telefono=valor('telefono').trim(),correo=valor('correo').trim();
 if(!nombre||nombre.length>200)return {error:'Escribe el nombre del contacto (hasta 200 caracteres).'} as const;
 if(puesto.length>200||telefono.length>100)return {error:'Revisa el puesto y el teléfono del contacto.'} as const;
 if(correo.length>254||(correo&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)))return {error:'Escribe un correo válido.'} as const;
 if(!telefono&&!correo)return {error:'Agrega al menos un teléfono o correo.'} as const;
 return {datos:{nombre,puesto:puesto||null,telefono:telefono||null,correo:correo||null}} as const;
}
