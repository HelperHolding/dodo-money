"use server";
import { revalidatePath } from "next/cache";
import { clienteAdmin, volver } from "../../servidor";
const ruta="/compras/pagos/reservas";
export async function reservar(fd:FormData){
 const db=await clienteAdmin(ruta);
 const {error}=await db.rpc("reservar_boveda",{p_sucursal:String(fd.get("sucursal")),p_factura:String(fd.get("factura")),p_monto:Number(fd.get("monto")),p_fecha:String(fd.get("fecha")),p_motivo:String(fd.get("motivo"))});
 if(error)volver(ruta,"error",error.message);
 revalidatePath("/","layout");volver(ruta,"ok","Efectivo reservado. La salida a corporativo conservará este importe además del fondo.");
}
export async function liberar(fd:FormData){
 const db=await clienteAdmin(ruta);
 const {error}=await db.rpc("cancelar_reserva_boveda",{p_id:String(fd.get("id")),p_motivo:String(fd.get("motivo"))});
 if(error)volver(ruta,"error",error.message);
 revalidatePath("/","layout");volver(ruta,"ok","Reserva liberada; se conserva su historial.");
}

