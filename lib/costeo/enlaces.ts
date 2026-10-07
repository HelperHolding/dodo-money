export const fichaInsumo=(version:string,referencia:string)=>`/ventas/costos/insumos/${encodeURIComponent(referencia)}?version=${encodeURIComponent(version)}`;
export const fichaReceta=(version:string,clave:string)=>`/ventas/costos/recetas/${encodeURIComponent(clave)}?version=${encodeURIComponent(version)}`;
