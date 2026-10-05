import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCfdi, leerComplementoPago, NO_ES_CFDI } from "./cfdi.ts";

const TFD = (uuid: string) =>
  `<cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-09-25T10:16:00"/></cfdi:Complemento>`;

const INGRESO = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="1234" Fecha="2026-09-25T10:15:00" FormaPago="03" SubTotal="1000.00" Descuento="0.00" Moneda="MXN" Total="1080.00" TipoDeComprobante="I" Exportacion="01" MetodoPago="PPD" LugarExpedicion="44100">
  <cfdi:Emisor Rfc="LBA010203AB1" Nombre="LACTEOS &amp; ABARROTES DEL BAJIO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DPM010203XY9" Nombre="DODO PIZZA MEXICO" DomicilioFiscalReceptor="44100" RegimenFiscalReceptor="601" UsoCFDI="G01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="50131700" Cantidad="10" ClaveUnidad="KGM" Unidad="Kilogramo" Descripcion="QUESO MOZZARELLA" ValorUnitario="50.00" Importe="500.00" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.000000" Importe="0.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
    <cfdi:Concepto ClaveProdServ="24121500" Cantidad="100" ClaveUnidad="H87" Descripcion="CAJA PIZZA 35" ValorUnitario="5.00" Importe="500.00" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="80.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="80.00"><cfdi:Traslados><cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="80.00"/></cfdi:Traslados></cfdi:Impuestos>
  ${TFD("6f2d9a2b-1c3e-4f5a-8b7c-9d0e1f2a3b4c")}
</cfdi:Comprobante>`;

test("ingreso CFDI 4.0: encabezado, emisor, receptor, impuestos del comprobante y conceptos", () => {
  const r = leerCfdi(INGRESO);
  assert.ok("cfdi" in r);
  assert.deepEqual(r.cfdi, {
    uuid: "6F2D9A2B-1C3E-4F5A-8B7C-9D0E1F2A3B4C", version: "4.0", serie: "A", folio: "1234", tipo: "ingreso", fecha: "2026-09-25",
    rfc_emisor: "LBA010203AB1", nombre_emisor: "LACTEOS & ABARROTES DEL BAJIO", regimen_emisor: "601", rfc_receptor: "DPM010203XY9",
    metodo_pago: "PPD", forma_pago: "03", moneda: "MXN", subtotal: 1000, descuento: 0, iva: 80, retenciones: 0, retencion_iva: 0, retencion_isr: 0, total: 1080,
    uuid_relacionado: null, uuids_relacionados: [],
    conceptos: [
      { descripcion: "QUESO MOZZARELLA", cantidad: 10, unidad: "Kilogramo", valor_unitario: 50, importe: 500 },
      { descripcion: "CAJA PIZZA 35", cantidad: 100, unidad: "H87", valor_unitario: 5, importe: 500 },
    ],
  });
});

test("CFDI 3.3 sin prefijo, comillas simples y retenciones; sin nodo de totales el IVA es 0", () => {
  const xml = `<Comprobante Version='3.3' Fecha='2026-09-01T08:00:00' SubTotal='1000' Moneda='MXN' Total='940' TipoDeComprobante='I' MetodoPago='PUE'>
    <Emisor Rfc='GOMJ800101AB2' Nombre='Juan Gómez' RegimenFiscal='612'/><Receptor Rfc='DPM010203XY9'/>
    <Conceptos><Concepto Cantidad='1' ClaveUnidad='E48' Descripcion='Mantenimiento' ValorUnitario='1000' Importe='1000'/></Conceptos>
    <Impuestos TotalImpuestosRetenidos='60'/>
    <Complemento><TimbreFiscalDigital UUID='AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'/></Complemento></Comprobante>`;
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.equal(r.cfdi.version, "3.3");
  assert.equal(r.cfdi.serie, null);
  assert.equal(r.cfdi.forma_pago, null);
  assert.equal(r.cfdi.iva, 0);
  assert.equal(r.cfdi.retenciones, 60);
  assert.equal(r.cfdi.metodo_pago, "PUE");
  assert.equal(r.cfdi.conceptos[0].unidad, "E48");
});

test("nota de crédito (egreso) con su factura relacionada", () => {
  const xml = INGRESO.replace('TipoDeComprobante="I"', 'TipoDeComprobante="E"')
    .replace("<cfdi:Emisor", '<cfdi:CfdiRelacionados TipoRelacion="01"><cfdi:CfdiRelacionado UUID="11111111-2222-3333-4444-555555555555"/></cfdi:CfdiRelacionados><cfdi:Emisor')
    .replace("6f2d9a2b-1c3e-4f5a-8b7c-9d0e1f2a3b4c", "99999999-8888-7777-6666-555555555555");
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.equal(r.cfdi.tipo, "egreso");
  assert.equal(r.cfdi.uuid_relacionado, "11111111-2222-3333-4444-555555555555");
});

test("rechazos con mensaje claro", () => {
  const error = (xml: string) => { const r = leerCfdi(xml); return "error" in r ? r.error : null; };
  assert.equal(error("<html>hola</html>"), NO_ES_CFDI);
  assert.equal(error(INGRESO.replace('Version="4.0"', 'Version="2.2"')), "Versión de CFDI no soportada (2.2); se aceptan 3.3 y 4.0.");
  assert.equal(error(INGRESO.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, "")), "La factura no está timbrada (no trae folio fiscal UUID).");
  assert.equal(error(INGRESO.replace('TipoDeComprobante="I"', 'TipoDeComprobante="P"')), "Es un complemento de pago: se sube en Pagos.");
  assert.equal(error(INGRESO.replace('TipoDeComprobante="I"', 'TipoDeComprobante="T"')), "Un comprobante de tipo T no se registra como factura de proveedor.");
  assert.equal(error(INGRESO.replace('Moneda="MXN"', 'Moneda="USD"')), "La factura está en USD; por ahora solo se registran en pesos (MXN).");
});

test("la Addenda del proveedor no agrega conceptos ni impuestos", () => {
  const xml = INGRESO
    .replace(/<cfdi:Impuestos TotalImpuestosTrasladados[\s\S]*?<\/cfdi:Impuestos>/, "")
    .replace("</cfdi:Comprobante>", `<cfdi:Addenda><prov:Datos><cfdi:Concepto Descripcion="FALSO" Importe="5"/><cfdi:Impuestos TotalImpuestosTrasladados="999"/></prov:Datos></cfdi:Addenda></cfdi:Comprobante>`);
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.equal(r.cfdi.conceptos.length, 2);
  assert.equal(r.cfdi.iva, 0);
});

test("una nota de crédito que corrige varias facturas trae todas", () => {
  const xml = INGRESO.replace('TipoDeComprobante="I"', 'TipoDeComprobante="E"')
    .replace("<cfdi:Emisor", '<cfdi:CfdiRelacionados TipoRelacion="01"><cfdi:CfdiRelacionado UUID="11111111-2222-3333-4444-555555555555"/><cfdi:CfdiRelacionado UUID="aaaaaaaa-2222-3333-4444-555555555555"/></cfdi:CfdiRelacionados><cfdi:Emisor');
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.equal(r.cfdi.uuid_relacionado, "11111111-2222-3333-4444-555555555555");
  assert.deepEqual(r.cfdi.uuids_relacionados, ["11111111-2222-3333-4444-555555555555", "AAAAAAAA-2222-3333-4444-555555555555"]);
});

test("un > dentro de un atributo no corta la etiqueta", () => {
  const r = leerCfdi(INGRESO.replace('Descripcion="QUESO MOZZARELLA"', 'Descripcion="TUBO > 3M"'));
  assert.ok("cfdi" in r);
  assert.deepEqual(r.cfdi.conceptos[0], { descripcion: "TUBO > 3M", cantidad: 10, unidad: "Kilogramo", valor_unitario: 50, importe: 500 });
});

const COMPLEMENTO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Fecha="2026-10-02T09:00:00" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P">
  <cfdi:Emisor Rfc="LBA010203AB1" Nombre="LACTEOS DEL BAJIO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DPM010203XY9" UsoCFDI="CP01"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/></cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="1500.00"/>
      <pago20:Pago FechaPago="2026-10-01T12:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="1500.00">
        <pago20:DoctoRelacionado IdDocumento="6f2d9a2b-1c3e-4f5a-8b7c-9d0e1f2a3b4c" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="1080.00" ImpPagado="1000.00" ImpSaldoInsoluto="80.00" ObjetoImpDR="01"/>
        <pago20:DoctoRelacionado IdDocumento="11111111-2222-3333-4444-555555555555" MonedaDR="MXN" NumParcialidad="2" ImpPagado="500.00" ObjetoImpDR="01"/>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="cccccccc-dddd-eeee-ffff-000000000000"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

test("complemento de pago 2.0: fecha del pago, monto y documentos que cubre", () => {
  const r = leerComplementoPago(COMPLEMENTO);
  assert.ok("complemento" in r);
  assert.deepEqual(r.complemento, {
    uuid: "CCCCCCCC-DDDD-EEEE-FFFF-000000000000", fecha: "2026-10-01", rfc_emisor: "LBA010203AB1", nombre_emisor: "LACTEOS DEL BAJIO",
    rfc_receptor: "DPM010203XY9", monto: 1500,
    documentos: [
      { uuid: "6F2D9A2B-1C3E-4F5A-8B7C-9D0E1F2A3B4C", monto_pagado: 1000, parcialidad: 1 },
      { uuid: "11111111-2222-3333-4444-555555555555", monto_pagado: 500, parcialidad: 2 },
    ],
  });
});

test("complemento: rechaza facturas normales y complementos sin documentos", () => {
  const error = (xml: string) => { const r = leerComplementoPago(xml); return "error" in r ? r.error : null; };
  assert.equal(error(INGRESO), "No es un complemento de pago (es tipo I): las facturas se suben en Facturas.");
  assert.equal(error(COMPLEMENTO.replace(/<pago20:DoctoRelacionado[^>]*\/>/g, "")), "El complemento no dice qué facturas paga.");
  assert.equal(error("<x/>"), NO_ES_CFDI);
});

test("retenciones del comprobante por tipo (ISR 001, IVA 002); las de los conceptos no se suman", () => {
  const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-10-01T10:00:00" SubTotal="31200" Moneda="MXN" Total="29744" TipoDeComprobante="I" MetodoPago="PUE">
  <cfdi:Emisor Rfc="PEPJ800101AB1" Nombre="JUAN PEREZ" RegimenFiscal="606"/><cfdi:Receptor Rfc="DPM010203XY9"/>
  <cfdi:Conceptos>
    <cfdi:Concepto Cantidad="1" ClaveUnidad="E48" Descripcion="Renta" ValorUnitario="30000" Importe="30000"><cfdi:Impuestos><cfdi:Retenciones><cfdi:Retencion Base="30000" Impuesto="001" TipoFactor="Tasa" TasaOCuota="0.100000" Importe="3000"/></cfdi:Retenciones></cfdi:Impuestos></cfdi:Concepto>
    <cfdi:Concepto Cantidad="1" ClaveUnidad="E48" Descripcion="Agua" ValorUnitario="1200" Importe="1200"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosRetenidos="6448" TotalImpuestosTrasladados="4992"><cfdi:Retenciones><cfdi:Retencion Impuesto="001" Importe="3120"/><cfdi:Retencion Impuesto="002" Importe="3328"/></cfdi:Retenciones></cfdi:Impuestos>
  ${TFD("12345678-1234-1234-1234-123456789012")}
</cfdi:Comprobante>`;
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.deepEqual([r.cfdi.retenciones, r.cfdi.retencion_isr, r.cfdi.retencion_iva], [6448, 3120, 3328]);
});
