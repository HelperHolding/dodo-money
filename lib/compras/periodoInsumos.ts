/** Solo compras exclusivamente clasificadas como insumos omiten el periodo visible. */
export function soloInsumos(cuentas:readonly (string|null|undefined)[],cuentaDocumento?:string|null){
 return cuentas.length?cuentas.every(c=>(c||cuentaDocumento)==="insumos"):cuentaDocumento==="insumos";
}
