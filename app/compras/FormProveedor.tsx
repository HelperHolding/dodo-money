"use client";
import {useState} from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { CATEGORIAS_COMPRA, FORMAS_PAGO, INICIOS_CUBRE, NOMBRE_CATEGORIA_COMPRA, NOMBRE_FORMA_PAGO, NOMBRE_INICIO_CUBRE, REGIMENES, type DatosProveedor } from "@/lib/compras/proveedores";
import { CUENTAS_GASTO, CUENTAS_MEMO, NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import { guardarProveedor } from "./acciones";
import { CampoConstancia } from "./CampoConstancia";
import { FormValidado } from "./FormValidado";
import { DOCUMENTOS_ALTA, NOMBRE_DOCUMENTO } from "@/lib/compras/documentos";
import { hoyCalendarioMX } from "@/lib/formato";

export function FormProveedor({ id, inicial, sucursales }: { id?: string; inicial?: DatosProveedor; sucursales: { id: string; nombre: string }[] }) {
  const [categorias,setCategorias]=useState(inicial?.categorias??[]);
  const [cuentaPl,setCuentaPl]=useState(inicial?.cuenta_pl??'');
  const [meses,setMeses]=useState(String(inicial?.cubre_meses??1));
  const [inicio,setInicio]=useState(inicial?.cubre_inicio??'emision');
  const muestraPeriodo=categorias.includes('servicio')||['renta','servicios'].includes(cuentaPl);
  const v = (c: keyof DatosProveedor) => (inicial?.[c] ?? "") as string;
  const campo = (nombre: keyof DatosProveedor, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="campo">
      <label htmlFor={nombre}>{etiqueta}</label>
      <input id={nombre} name={nombre} defaultValue={v(nombre)} {...extra} />
    </div>
  );
  return (
    <FormValidado tipo="proveedor" action={guardarProveedor} className="seccion formulario">
      {id && <input type="hidden" name="id" value={id} />}
      {!id && <CampoConstancia />}
      {!id && <fieldset className="seccion">
        <legend>Documentos para el alta</legend>
        <p>La carátula bancaria y la opinión de cumplimiento son opcionales. Puedes adjuntarlas ahora o después desde el expediente del proveedor. Si adjuntas un documento, indica su fecha.</p>
        <p className="saldo-nota">PDF o foto (JPG, PNG o WebP). Máximo 4 MB entre estos documentos y la constancia fiscal.</p>
        {DOCUMENTOS_ALTA.map(tipo => <div className="rejilla" key={tipo}>
          <div className="campo"><label htmlFor={tipo}>{NOMBRE_DOCUMENTO[tipo]} (opcional)</label><input id={tipo} name={tipo} type="file" accept="application/pdf,image/jpeg,image/png,image/webp"/></div>
          <div className="campo"><label htmlFor={`${tipo}_fecha`}>Fecha de {tipo === "caratula_banco" ? "la carátula" : "la opinión"}</label><input id={`${tipo}_fecha`} name={`${tipo}_fecha`} type="date" max={hoyCalendarioMX()}/></div>
        </div>)}
      </fieldset>}
      <h2>Datos fiscales</h2>
      <div className="rejilla">
        {campo("razon_social", "Razón social", { required: true })}
        {campo("nombre_comercial", "Nombre comercial")}
        {campo("numero_cliente", "Nuestro número de cliente", { maxLength: 60, placeholder: "Opcional" })}
        {campo("dias_entrega", "Días de entrega", { type: "number", inputMode: "numeric", min: 0, max: 365, step: 1, placeholder: "Opcional" })}
        {campo("rfc", "RFC", { required: true, maxLength: 15, autoCapitalize: "characters" })}
        <div className="campo">
          <label htmlFor="regimen_fiscal">Régimen fiscal</label>
          <select id="regimen_fiscal" name="regimen_fiscal" defaultValue={v("regimen_fiscal")} required>
            <option value="" disabled>Elige…</option>
            {Object.entries(REGIMENES).map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
          </select>
        </div>
      </div>
      <h2>Contacto</h2>
      <div className="rejilla">
        {campo("contacto_nombre", "Nombre")}
        {campo("telefono", "Teléfono", { type: "tel" })}
        {campo("correo", "Correo", { type: "email" })}
      </div>
      <fieldset className="campo">
        <legend>Qué surte</legend>
        <div className="acciones">
          {CATEGORIAS_COMPRA.map((c) => (
            <label key={c}><input type="checkbox" name="categorias" value={c} checked={categorias.includes(c)} onChange={e=>setCategorias(actual=>e.target.checked?[...actual,c]:actual.filter(x=>x!==c))} /> {NOMBRE_CATEGORIA_COMPRA[c]}</label>
          ))}
        </div>
      </fieldset>
      <h2>Pago</h2>
      <div className="rejilla">
        {campo("banco", "Banco")}
        {campo("clabe", "CLABE", { inputMode: "numeric", maxLength: 18, pattern: "[0-9]{18}" })}
        {campo("cuenta", "Cuenta")}
        {campo("dias_credito", "Días de crédito", { type: "number", min: 0, max: 365, step: 1, defaultValue: String(inicial?.dias_credito ?? 0) })}
        <div className="campo">
          <label htmlFor="forma_pago_habitual">Forma de pago habitual</label>
          <select id="forma_pago_habitual" name="forma_pago_habitual" defaultValue={inicial?.forma_pago_habitual ?? "transferencia"}>
            {FORMAS_PAGO.map((f) => <option key={f} value={f}>{NOMBRE_FORMA_PAGO[f]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="cuenta_pl">Cuenta del P&L</label>
          <select id="cuenta_pl" name="cuenta_pl" value={cuentaPl} onChange={e=>setCuentaPl(e.target.value)}>
            <option value="">Sin cuenta</option>
            {[...CUENTAS_GASTO, ...CUENTAS_MEMO].map((c) => <option key={c} value={c}>{NOMBRE_CUENTA[c]}</option>)}
          </select>
          <small>Sus facturas la toman sola; se puede cambiar en cada factura.</small>
        </div>
        <div className="campo">
          <label htmlFor="sucursal_id">Sucursal por omisión</label>
          <select id="sucursal_id" name="sucursal_id" defaultValue={v("sucursal_id")}>
            <option value="">Ninguna (Oficina)</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <small>Sus facturas se cargan aquí si no se elige otra.</small>
        </div>
        {muestraPeriodo&&<><div className="campo">
          <label htmlFor="cubre_meses">Cada recibo cubre (meses)</label>
          <input id="cubre_meses" name="cubre_meses" type="number" inputMode="numeric" min={1} max={12} step={1} value={meses} onChange={e=>setMeses(e.target.value)} disabled={!muestraPeriodo} />
          <small>Ej. CFE 2, fumigación 3, renta 1. El P&L reparte cada recibo en esos meses.</small>
        </div>
        <div className="campo">
          <label htmlFor="cubre_inicio">Desde qué mes</label>
          <select id="cubre_inicio" name="cubre_inicio" value={inicio} onChange={e=>setInicio(e.target.value as typeof inicio)} disabled={!muestraPeriodo}>
            {INICIOS_CUBRE.map((i) => <option key={i} value={i}>{NOMBRE_INICIO_CUBRE[i]}</option>)}
          </select>
        </div></>}
      </div>
      {!muestraPeriodo&&<><input type="hidden" name="cubre_meses" value={inicial?.cubre_meses??1}/><input type="hidden" name="cubre_inicio" value={inicial?.cubre_inicio??'emision'}/></>}

      <div className="campo">
        <label htmlFor="notas">Notas</label>
        <textarea id="notas" name="notas" defaultValue={v("notas")} rows={3} />
      </div>
      <BotonEnviar>{id ? "Guardar cambios" : "Dar de alta"}</BotonEnviar>
    </FormValidado>
  );
}
