/** Validación compartida; nunca registrar ni devolver la contraseña. */
export function errorContrasenaTemporal(nueva:string,confirmar:string,motivo:string) {
 if(nueva.length<12||nueva.length>128)return 'La contraseña temporal debe tener entre 12 y 128 caracteres.';
 if(nueva!==confirmar)return 'Las contraseñas temporales no coinciden.';
 if(motivo.trim().length<5||motivo.trim().length>1000)return 'Escribe un motivo de 5 a 1000 caracteres.';
 return null;
}
