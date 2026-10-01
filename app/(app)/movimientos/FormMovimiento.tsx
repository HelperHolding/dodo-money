"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { NOMBRE_MOVIMIENTO, RUTAS, type TipoCaja, type TipoMovimiento } from "@/lib/tipos";
import { registrarMovimiento } from "./actions";

const NOMBRE_CAJA: Record<TipoCaja, string> = {
  venta: "Caja de venta", cambios: "Fondo de cambios", boveda: "Bóveda", caja_chica: "Caja chica", corporativo: "Corporativo",
};

const AYUDA: Record<TipoMovimiento, string> = {
  apertura: "El fondo con el que arranca la caja de venta sale de la bóveda.",
  retiro_boveda: "Cuando el cajón pasa del límite o al cerrar el turno, el excedente va a la bóveda.",
  cambio_morralla: "Billetes por monedas: ninguna caja cambia su total. Registra el monto intercambiado.",
  salida_corporativo: "Todo lo que sale de la bóveda se entrega a corporativo con su recibo. Lo recoge un admin y lo recibe corporativo.",
  reposicion_caja_chica: "La caja chica se repone con dinero de corporativo, nunca con efectivo de ventas.",
};

export function FormMovimiento({ limiteRetiro }: { limiteRetiro: number }) {
  const [tipo, setTipo] = useState<TipoMovimiento>("retiro_boveda");
  const ruta = RUTAS[tipo];
  const [origen, setOrigen] = useState<TipoCaja>(ruta.origen[0]);
  const destinos = ruta.destino.filter((d) => d !== origen);

  function cambiarTipo(nuevo: TipoMovimiento) {
    setTipo(nuevo);
    setOrigen(RUTAS[nuevo].origen[0]);
  }

  return (
    <form action={registrarMovimiento} className="seccion" aria-labelledby="t-nuevo">
      <h2 id="t-nuevo">Registrar movimiento</h2>
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="tipo">Movimiento</label>
          <select id="tipo" name="tipo" value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoMovimiento)}>
            {(Object.keys(RUTAS) as TipoMovimiento[]).map((t) => (
              <option key={t} value={t}>{NOMBRE_MOVIMIENTO[t]}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="origen">Sale de</label>
          <select id="origen" name="origen" value={origen} onChange={(e) => setOrigen(e.target.value as TipoCaja)}>
            {ruta.origen.map((c) => <option key={c} value={c}>{NOMBRE_CAJA[c]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="destino">Entra a</label>
          <select id="destino" name="destino" key={`${tipo}-${origen}`} defaultValue={destinos[0]}>
            {destinos.map((c) => <option key={c} value={c}>{NOMBRE_CAJA[c]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="monto">Monto</label>
          <input id="monto" name="monto" type="number" inputMode="decimal" min="0.5" step="0.5" required />
        </div>
      </div>
      <p className="aviso aviso-info">
        {AYUDA[tipo]}
        {tipo === "retiro_boveda" && limiteRetiro > 0 && ` Límite del cajón en esta sucursal: $${limiteRetiro.toLocaleString("es-MX")}.`}
      </p>
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="folio">{tipo === "salida_corporativo" ? "Folio o recibo" : "Folio o referencia"}</label>
          <input id="folio" name="folio" required={tipo === "salida_corporativo"} />
        </div>
        <div className="campo">
          <label htmlFor="nota">Nota</label>
          <input id="nota" name="nota" placeholder="Opcional" />
        </div>
      </div>
      <div className="acciones"><BotonEnviar>Registrar movimiento</BotonEnviar></div>
    </form>
  );
}
