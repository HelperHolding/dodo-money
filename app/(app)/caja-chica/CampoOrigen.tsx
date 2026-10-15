"use client";

import {CampoFoto} from "./CampoFoto";
import { useState } from "react";
import { CUENTAS_GASTO, NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import { NOMBRE_ORIGEN, ORIGENES, type OrigenGasto } from "@/lib/gastos";

const AYUDA: Record<OrigenGasto, string> = {
  caja_chica: "Baja la caja chica y entra en la siguiente reposición.",
  boveda: "Baja la bóveda; el cierre del día lo descuenta. No se repone.",
  empleado: "Ninguna caja cambia: queda por reponer a esa persona.",
};

/** De dónde salió el dinero; si lo pagó un empleado, quién; y a qué cuenta del P&L va. */
export function CampoOrigen({ personas, yo }: { personas: { id: string; nombre: string }[]; yo: string }) {
  const [informativo,setInformativo]=useState(false);
  const [origen, setOrigen] = useState<OrigenGasto>("caja_chica");
  return (
    <>
      <div className="campo"><label htmlFor="modo-gasto">Tipo de registro</label><select id="modo-gasto" name="informativo" value={informativo?"si":"no"} onChange={e=>setInformativo(e.target.value==="si")}><option value="no">Registrar gasto</option><option value="si">Cuadrado en corte correspondiente, informativo</option></select><small>{informativo?"Ya se pagó y quedó descontado en un corte anterior. Se refleja en el P&L, sin descontar otra vez ni generar reposición.":"Se descuenta del origen elegido o queda pendiente de reponer al empleado."}</small></div>
      {informativo&&<><div className="campo"><label htmlFor="referencia-informativa">Referencia del corte o ticket original</label><input id="referencia-informativa" name="referencia_informativa" required minLength={3} maxLength={200}/></div><div className="campo"><label htmlFor="motivo-informativo">Motivo de la captura tardía</label><textarea id="motivo-informativo" name="motivo_informativo" required minLength={10} maxLength={1000} placeholder="Ya pagado en el corte del…; no se había registrado el gasto."/></div><label><input type="checkbox" name="confirmado" value="si" required/> Confirmo que ya se descontó y no había registrado este gasto en el sistema.</label></>}

      <div className="campo">
        <label htmlFor="origen">¿De dónde salió el dinero?</label>
        <select id="origen" name="origen" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenGasto)}>
          {ORIGENES.map((o) => <option key={o} value={o}>{NOMBRE_ORIGEN[o]}</option>)}
        </select>
        <small>{informativo?"Origen original, solo informativo. No vuelve a afectar este saldo.":AYUDA[origen]}</small>
      </div>
      {origen === "empleado" && (
        <div className="campo">
          <label htmlFor="pagado_por">¿Quién lo pagó?</label>
          <select id="pagado_por" name="pagado_por" defaultValue={yo} required>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      )}
      <div className="campo">
        <label htmlFor="cuenta_pl">¿Qué tipo de gasto es?</label>
        <select id="cuenta_pl" name="cuenta_pl" defaultValue="otros">
          {CUENTAS_GASTO.map((c) => <option key={c} value={c}>{NOMBRE_CUENTA[c]}</option>)}
        </select>
        <small>Para el estado de resultados (P&L). Si no sabes, déjalo en Otros.</small>
      </div>
      <CampoFoto obligatorio={informativo}/>
    </>
  );
}
