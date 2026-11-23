"use client";
import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { CampoFoto } from "@/app/(app)/caja-chica/CampoFoto";
import { NOMBRES_SECCION, TIPOS, type TipoTicket } from "@/lib/soporte";
import { crearTicket } from "../acciones";

/** Alta de ticket: tipo, sección (prellenada con la página de donde vino), título, descripción, si bloquea y captura. */
export function FormTicket({ desde, seccion }: { desde: string | null; seccion: string }) {
  const [tipo, setTipo] = useState<TipoTicket>("problema");
  return (
    <form action={crearTicket} className="formulario seccion">
      <input type="hidden" name="ruta_origen" value={desde ?? ""} />
      <fieldset className="campo">
        <legend>¿Qué quieres reportar?</legend>
        {(Object.keys(TIPOS) as TipoTicket[]).map((t) => (
          <label key={t}><input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} /> {t === "problema" ? "Algo no funciona" : "Una idea de mejora"}</label>
        ))}
      </fieldset>
      <div className="campo"><label htmlFor="seccion">Sección del sistema</label>
        <select id="seccion" name="seccion" defaultValue={seccion}>{NOMBRES_SECCION.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="campo"><label htmlFor="titulo">Título</label>
        <input id="titulo" name="titulo" required minLength={5} maxLength={150} placeholder={tipo === "problema" ? "Ej. No guarda la foto del gasto" : "Ej. Poder exportar a Excel"} /></div>
      <div className="campo"><label htmlFor="descripcion">{tipo === "problema" ? "¿Qué pasó? ¿Qué esperabas que pasara?" : "¿Qué propones y para qué te serviría?"}</label>
        <textarea id="descripcion" name="descripcion" rows={5} required minLength={10} maxLength={4000} /></div>
      {tipo === "problema" && <label className="campo"><input type="checkbox" name="bloquea" value="1" /> Me impide trabajar</label>}
      <CampoFoto etiqueta="Captura de pantalla" camara={false} />
      <BotonEnviar pendiente="Enviando…">Enviar ticket</BotonEnviar>
    </form>
  );
}
