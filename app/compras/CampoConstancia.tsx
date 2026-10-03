"use client";

import { useState } from "react";
import { REGIMENES } from "@/lib/compras/proveedores";
import { leerConstanciaSubida, type LecturaConstancia } from "./acciones";

/** Pone un valor en un campo del formulario (los campos no son controlados: se escribe directo). */
function poner(form: HTMLFormElement, nombre: string, valor: string | null) {
  const campo = form.elements.namedItem(nombre);
  if (valor && (campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement)) campo.value = valor;
}

/**
 * Constancia de situación fiscal para el alta: al elegirla se leen RFC, razón social, nombre comercial y régimen
 * y se llenan en el formulario para revisarlos. El archivo se envía con el alta y queda como primer documento.
 */
export function CampoConstancia({ nota = "Descargada del portal del SAT: se llenan los datos fiscales y queda guardada en sus documentos." }: { nota?: string }) {
  const [estado, setEstado] = useState<{ leyendo?: boolean } & LecturaConstancia>({});

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const archivo = input.files?.[0];
    if (!archivo) { setEstado({}); return; }
    setEstado({ leyendo: true });
    const fd = new FormData();
    fd.set("constancia", archivo);
    const r = await leerConstanciaSubida(fd);
    setEstado(r);
    const form = input.form;
    if (!r.datos || !form) return;
    poner(form, "rfc", r.datos.rfc);
    poner(form, "razon_social", r.datos.razon_social);
    poner(form, "nombre_comercial", r.datos.nombre_comercial);
    poner(form, "regimen_fiscal", r.datos.regimen);
    poner(form, "codigo_postal", r.datos.codigo_postal);
  }

  const d = estado.datos;
  return (
    <div className="seccion-constancia">
      <div className="campo">
        <label htmlFor="constancia">Constancia de situación fiscal (opcional)</label>
        <input id="constancia" name="constancia" type="file" accept="application/pdf" onChange={alElegir} />
        <small>{nota}</small>
      </div>
      {estado.leyendo && <p className="saldo-nota">Leyendo la constancia…</p>}
      {estado.error && <p className="aviso aviso-error" role="alert">{estado.error}</p>}
      {d && (
        <p className="aviso aviso-ok" role="status">
          Se llenó con la constancia del {d.fecha_emision.split("-").reverse().join("/")}: {d.rfc} · {d.razon_social}
          {d.regimenes.length > 1
            ? `. Trae ${d.regimenes.length} regímenes vigentes (${d.regimenes.map((x) => `${x.codigo} ${REGIMENES[x.codigo] ?? x.nombre}`).join("; ")}); se eligió el ${d.regimen}, cámbialo si factura con otro.`
            : !d.regimen ? ". No se reconoció su régimen: elígelo abajo." : "."}
          {" "}Revisa los datos antes de guardar.
        </p>
      )}
    </div>
  );
}
