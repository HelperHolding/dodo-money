/**
 * Formato de la orden de compra: la estructura del formato de Zoho con el branding de Dodo
 * (negro, naranja #FF4E00 solo en rellenos y líneas, Manrope). Tamaño carta al imprimir.
 */
export const ESTILOS_FORMATO = `
body { background: var(--papel-2); }
.oc { max-width: 816px; margin: 24px auto; padding: 40px 44px; background: #fff; color: #000; font-size: 13px; line-height: 1.45;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.12); border-top: 6px solid var(--accion); }
.oc p { margin: 0; }
.oc-acciones { max-width: 816px; margin: 16px auto 0; display: flex; justify-content: flex-end; }
.oc h1 { font-size: 26px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.1; }
.oc h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accion-oscuro); margin: 0 0 6px; }

.oc-cabecera { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 1px solid #e3e3e3; }
.oc-empresa { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
.oc-empresa img { width: 64px; height: 64px; border-radius: 50%; flex: none; }
.oc-empresa div { color: #595959; overflow-wrap: anywhere; }
.oc-empresa-nombre { font-size: 15px; font-weight: 800; color: #000; margin-bottom: 2px !important; }
.oc-titulo { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.oc-folio { font-size: 15px; font-weight: 700; }
.oc-sello { border: 2px solid var(--alerta); color: var(--alerta); font-weight: 800; text-transform: uppercase; padding: 2px 10px; border-radius: 4px; }
.oc-total-caja { margin-top: 10px; border-left: 4px solid var(--accion); background: #f4f4f4; padding: 8px 14px; text-align: right; }
.oc-total-caja span { display: block; font-size: 11px; color: #595959; text-transform: uppercase; letter-spacing: 0.06em; }
.oc-total-caja strong { font-size: 18px; }

.oc-datos { display: flex; justify-content: space-between; gap: 24px; padding: 20px 0; }
.oc-proveedor { min-width: 0; overflow-wrap: anywhere; }
.oc-proveedor-nombre { font-size: 15px; font-weight: 800; }
.oc-claves { display: grid; grid-template-columns: auto auto; gap: 4px 16px; margin: 0; align-content: start; flex: none; }
.oc-claves dt { color: #595959; text-align: right; }
.oc-claves dd { margin: 0; font-weight: 700; text-align: right; }

.oc-tabla { width: 100%; border-collapse: collapse; margin-top: 4px; }
.oc-tabla th { background: #000; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; padding: 8px 10px; }
.oc-tabla td { padding: 10px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
.oc-tabla tbody tr:nth-child(even) td { background: #fafafa; }
.oc-num { width: 32px; color: #595959; }
.oc-der { text-align: right !important; white-space: nowrap; }
.oc-articulo { display: block; font-weight: 700; }
.oc-detalle { display: block; font-size: 11px; color: #595959; }
.oc-detalle-linea { font-size: 11px; color: #595959; font-weight: 400; }
.oc-vacio { text-align: center; color: #595959; }

.oc-pie { display: flex; justify-content: space-between; gap: 24px; padding-top: 18px; }
.oc-notas { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 28px; overflow-wrap: anywhere; }
.oc-firma { margin-top: auto; width: 220px; border-top: 1px solid #000; padding-top: 4px; font-size: 11px; color: #595959; }
.oc-totales { display: grid; grid-template-columns: auto auto; gap: 6px 0; margin: 0; min-width: 260px; align-content: start; }
.oc-totales > div { display: contents; }
.oc-totales dt { text-align: right; color: #595959; }
.oc-totales dd { margin: 0; padding-left: 24px; text-align: right; white-space: nowrap; }
.oc-total dt, .oc-total dd { background: var(--accion); color: #000; font-weight: 800; font-size: 15px; padding: 8px 10px; }
.oc-total dt { border-radius: 4px 0 0 4px; }
.oc-total dd { border-radius: 0 4px 4px 0; }

@media (max-width: 640px) {
  .oc { margin: 0; padding: 20px 16px; box-shadow: none; }
  .oc-cabecera, .oc-datos, .oc-pie { flex-direction: column; }
  .oc-titulo { text-align: left; align-items: flex-start; }
  .oc-total-caja { text-align: left; }
  .oc-claves { grid-template-columns: auto 1fr; }
  .oc-claves dt, .oc-claves dd { text-align: left; }
  .oc-tabla th:nth-child(4), .oc-tabla td:nth-child(4) { display: none; }
  .oc-totales { min-width: 0; }
}

@page { size: letter; margin: 12mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 10px Manrope, sans-serif; color: #595959; } }
@media print {
  body { background: #fff; }
  .no-imprimir { display: none !important; }
  .oc { margin: 0; padding: 0; max-width: none; box-shadow: none; }
  .oc-tabla th, .oc-total dt, .oc-total dd, .oc-total-caja, .oc-tabla tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .oc-tabla tr { break-inside: avoid; }
  .oc-pie { break-inside: avoid; }
}
`;
