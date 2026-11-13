-- ENSAYO. Corre todo el lote y lo deshace con ROLLBACK; no guarda nada. Debe devolver una fila PRUEBAS OK.
-- Lote CUENTAS-PENDIENTES-20261112: 138 equivalencias aprobadas por Sebastián el 12/11/2026 (354,096.28 de importe de referencia).
-- Quedan fuera, para decidir aparte: n65-68 (Bolpack sep. capturado como insumo), n79 (Coca posible duplicado),
-- n110 (depósito CFE), n127-131 (Sam's/Seven en "otros"), n134 (regalías a nombre de PHM).
-- Requiere las migraciones 20261024001536 y 20261026164618 (ya ejecutadas). No modifica facturas, gastos, pagos ni efectivo.
begin;
set local lock_timeout='5s';
create temp table plan_pendientes on commit drop as select * from jsonb_to_recordset(
 $plan$[
 {
  "n": 1,
  "clave": "concepto:222",
  "categoria": "consumibles_equipo",
  "importe": 2500,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n1): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 2,
  "clave": "concepto:223",
  "categoria": "consumibles_equipo",
  "importe": 450,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n2): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 3,
  "clave": "concepto:224",
  "categoria": "consumibles_equipo",
  "importe": 1700,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n3): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 4,
  "clave": "concepto:137",
  "categoria": "consumibles_equipo",
  "importe": 486,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n4): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 5,
  "clave": "concepto:138",
  "categoria": "consumibles_equipo",
  "importe": 279.8,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n5): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 6,
  "clave": "concepto:139",
  "categoria": "consumibles_equipo",
  "importe": 275,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n6): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 7,
  "clave": "concepto:140",
  "categoria": "consumibles_equipo",
  "importe": 275,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n7): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 8,
  "clave": "concepto:141",
  "categoria": "consumibles_equipo",
  "importe": 55,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n8): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 9,
  "clave": "concepto:144",
  "categoria": "consumibles_equipo",
  "importe": 55,
  "rfc": "CMS230321FI8",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n9): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 10,
  "clave": "concepto:126",
  "categoria": "consumibles_equipo",
  "importe": 249,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n10): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 11,
  "clave": "concepto:127",
  "categoria": "consumibles_equipo",
  "importe": 725,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n11): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 12,
  "clave": "concepto:128",
  "categoria": "consumibles_equipo",
  "importe": 55,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n12): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 13,
  "clave": "concepto:129",
  "categoria": "consumibles_equipo",
  "importe": 720.34,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n13): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 14,
  "clave": "concepto:203",
  "categoria": "consumibles_equipo",
  "importe": 729,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n14): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 15,
  "clave": "concepto:204",
  "categoria": "consumibles_equipo",
  "importe": 2348,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n15): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 16,
  "clave": "concepto:272",
  "categoria": "consumibles_equipo",
  "importe": 559.6,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n16): Limpieza. Productos de limpieza de la operación, igual que las compras de octubre del mismo tipo."
 },
 {
  "n": 17,
  "clave": "concepto:273",
  "categoria": "consumibles_equipo",
  "importe": 847.5,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n17): Limpieza. Productos de limpieza de la operación, igual que las compras de octubre del mismo tipo."
 },
 {
  "n": 18,
  "clave": "concepto:274",
  "categoria": "consumibles_equipo",
  "importe": 299.09,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n18): Limpieza. Productos de limpieza de la operación, igual que las compras de octubre del mismo tipo."
 },
 {
  "n": 19,
  "clave": "concepto:275",
  "categoria": "consumibles_equipo",
  "importe": 725,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n19): Limpieza. Productos de limpieza de la operación, igual que las compras de octubre del mismo tipo."
 },
 {
  "n": 20,
  "clave": "gasto:31f7f6cf-1b5e-48f7-815f-f5230cdcd6de",
  "categoria": "consumibles_equipo",
  "importe": 66.5,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n20): Limpieza. Productos de limpieza de la operación, igual que las compras de octubre del mismo tipo."
 },
 {
  "n": 21,
  "clave": "gasto:c2e23562-2f09-4d16-bcbd-e03a56c06dd0",
  "categoria": "consumibles_equipo",
  "importe": 62,
  "rfc": "HCM260306B93",
  "codigo": "602-84-101",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n21): Consumibles y equipo menor. Desechables de la operación."
 },
 {
  "n": 22,
  "clave": "gasto:04c4ae9c-189b-4686-bb1e-b93740b2f35d",
  "categoria": "consumibles_equipo",
  "importe": 130,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n22): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 23,
  "clave": "gasto:9d952a2b-f0c7-4c83-af07-2f93087b138d",
  "categoria": "consumibles_equipo",
  "importe": 62.98,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n23): Limpieza: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 24,
  "clave": "gasto:308b8085-2e55-4ea8-9f4e-25e3b4e6524d",
  "categoria": "consumibles_equipo",
  "importe": 37.5,
  "rfc": "HCM260306B93",
  "codigo": "602-54-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n24): Limpieza. Productos de limpieza de la operación, igual que las compras de octubre del mismo tipo."
 },
 {
  "n": 25,
  "clave": "gasto:d2b101de-1719-41d7-a40f-fe857261fb16",
  "categoria": "insumos",
  "importe": 150,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n25): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 26,
  "clave": "concepto:265",
  "categoria": "insumos",
  "importe": 3923.44,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n26): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 27,
  "clave": "concepto:266",
  "categoria": "insumos",
  "importe": 2807.55,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n27): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 28,
  "clave": "concepto:267",
  "categoria": "insumos",
  "importe": 798.2,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n28): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 29,
  "clave": "concepto:268",
  "categoria": "insumos",
  "importe": 736.38,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n29): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 30,
  "clave": "concepto:316",
  "categoria": "insumos",
  "importe": 7356.45,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n30): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 31,
  "clave": "concepto:317",
  "categoria": "insumos",
  "importe": 704.87,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n31): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 32,
  "clave": "concepto:318",
  "categoria": "insumos",
  "importe": 399.75,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n32): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 33,
  "clave": "concepto:319",
  "categoria": "insumos",
  "importe": 2159.1,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n33): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 34,
  "clave": "concepto:320",
  "categoria": "insumos",
  "importe": 208.8,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n34): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 35,
  "clave": "concepto:359",
  "categoria": "insumos",
  "importe": 2807.55,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n35): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 36,
  "clave": "concepto:360",
  "categoria": "insumos",
  "importe": 490.92,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n36): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 37,
  "clave": "concepto:361",
  "categoria": "insumos",
  "importe": 369,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n37): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 38,
  "clave": "concepto:362",
  "categoria": "insumos",
  "importe": 1961.72,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n38): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 39,
  "clave": "concepto:363",
  "categoria": "insumos",
  "importe": 0.1,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n39): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 40,
  "clave": "concepto:258",
  "categoria": "insumos",
  "importe": 441,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n40): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 41,
  "clave": "concepto:259",
  "categoria": "insumos",
  "importe": 395,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n41): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 42,
  "clave": "concepto:260",
  "categoria": "insumos",
  "importe": 28,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n42): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 43,
  "clave": "concepto:261",
  "categoria": "insumos",
  "importe": 416,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n43): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 44,
  "clave": "concepto:262",
  "categoria": "insumos",
  "importe": 750,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n44): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 45,
  "clave": "concepto:293",
  "categoria": "insumos",
  "importe": 546,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n45): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 46,
  "clave": "concepto:294",
  "categoria": "insumos",
  "importe": 1740,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n46): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 47,
  "clave": "concepto:295",
  "categoria": "insumos",
  "importe": 29,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n47): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 48,
  "clave": "concepto:296",
  "categoria": "insumos",
  "importe": 237,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n48): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 49,
  "clave": "concepto:59",
  "categoria": "insumos",
  "importe": 256,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n49): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 50,
  "clave": "concepto:60",
  "categoria": "insumos",
  "importe": 28,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n50): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 51,
  "clave": "concepto:61",
  "categoria": "insumos",
  "importe": 625,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n51): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 52,
  "clave": "concepto:62",
  "categoria": "insumos",
  "importe": 237,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n52): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 53,
  "clave": "concepto:63",
  "categoria": "insumos",
  "importe": 196,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n53): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 54,
  "clave": "concepto:336",
  "categoria": "insumos",
  "importe": 504,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n54): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 55,
  "clave": "concepto:337",
  "categoria": "insumos",
  "importe": 1160,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n55): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 56,
  "clave": "concepto:338",
  "categoria": "insumos",
  "importe": 373.8,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n56): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 57,
  "clave": "concepto:339",
  "categoria": "insumos",
  "importe": 252,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n57): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 58,
  "clave": "concepto:340",
  "categoria": "insumos",
  "importe": 58,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n58): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 59,
  "clave": "concepto:240",
  "categoria": "insumos",
  "importe": 364,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n59): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 60,
  "clave": "concepto:327",
  "categoria": "insumos",
  "importe": 364,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n60): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 61,
  "clave": "concepto:329",
  "categoria": "insumos",
  "importe": 280,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n61): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 62,
  "clave": "concepto:353",
  "categoria": "insumos",
  "importe": 168,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n62): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 63,
  "clave": "concepto:248",
  "categoria": "insumos",
  "importe": 2610.5,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n63): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 64,
  "clave": "concepto:271",
  "categoria": "insumos",
  "importe": 3164.5,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n64): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 69,
  "clave": "concepto:243",
  "categoria": "insumos",
  "importe": 1455.9,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n69): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 70,
  "clave": "concepto:244",
  "categoria": "insumos",
  "importe": 3526,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n70): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 71,
  "clave": "concepto:264",
  "categoria": "insumos",
  "importe": 6280,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n71): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 72,
  "clave": "concepto:306",
  "categoria": "insumos",
  "importe": 363.98,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n72): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 73,
  "clave": "concepto:307",
  "categoria": "insumos",
  "importe": 932,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n73): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 74,
  "clave": "concepto:308",
  "categoria": "insumos",
  "importe": 1884.06,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n74): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 75,
  "clave": "concepto:310",
  "categoria": "insumos",
  "importe": 1763,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n75): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 76,
  "clave": "concepto:348",
  "categoria": "insumos",
  "importe": 1884,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n76): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 77,
  "clave": "concepto:349",
  "categoria": "insumos",
  "importe": 1820,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n77): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 78,
  "clave": "concepto:350",
  "categoria": "insumos",
  "importe": 3526,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n78): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 80,
  "clave": "gasto:77c7f53a-e6e8-4b30-8e38-a6095fedab3c",
  "categoria": "insumos",
  "importe": 2070.64,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n80): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 81,
  "clave": "gasto:2cb72ab6-94f4-42b6-823a-21cd1d4f6e1f",
  "categoria": "insumos",
  "importe": 264,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n81): Compras nacionales. Salida de bóveda de refrescos (venta interna); se deja en memo para no tocar el P&L, propuesta aceptada por Sebastián."
 },
 {
  "n": 82,
  "clave": "gasto:76d5a90e-7bba-46e6-a9fe-2ab6f07187b5",
  "categoria": "insumos",
  "importe": 518.5,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n82): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 83,
  "clave": "gasto:4015a890-3509-40f5-abc0-8b8b2e37335a",
  "categoria": "insumos",
  "importe": 519,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n83): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 84,
  "clave": "concepto:269",
  "categoria": "insumos",
  "importe": 1593.54,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n84): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 85,
  "clave": "concepto:270",
  "categoria": "insumos",
  "importe": 780,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n85): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 86,
  "clave": "concepto:228",
  "categoria": "insumos",
  "importe": 1014.89,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n86): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 87,
  "clave": "concepto:251",
  "categoria": "insumos",
  "importe": 600,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n87): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 88,
  "clave": "concepto:252",
  "categoria": "insumos",
  "importe": 870,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n88): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 89,
  "clave": "concepto:298",
  "categoria": "insumos",
  "importe": 2030,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n89): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 90,
  "clave": "concepto:351",
  "categoria": "insumos",
  "importe": 2320,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n90): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 91,
  "clave": "concepto:352",
  "categoria": "insumos",
  "importe": 600,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n91): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 92,
  "clave": "concepto:355",
  "categoria": "insumos",
  "importe": 1202,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n92): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 93,
  "clave": "concepto:356",
  "categoria": "insumos",
  "importe": 1061.08,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n93): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 94,
  "clave": "concepto:357",
  "categoria": "insumos",
  "importe": 1145.76,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n94): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 95,
  "clave": "gasto:2589f049-ead0-42f8-b989-103e820ef507",
  "categoria": "insumos",
  "importe": 45,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n95): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 96,
  "clave": "gasto:7b1b431b-c557-4fe1-9ec0-053386a44282",
  "categoria": "insumos",
  "importe": 104,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n96): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 97,
  "clave": "concepto:283",
  "categoria": "insumos",
  "importe": 2275.28,
  "rfc": "CMS230321FI8",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n97): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 98,
  "clave": "concepto:282",
  "categoria": "insumos",
  "importe": 2275.28,
  "rfc": "CMS230321FI8",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n98): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 99,
  "clave": "concepto:284",
  "categoria": "insumos",
  "importe": 3981.73,
  "rfc": "CMS230321FI8",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n99): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 100,
  "clave": "concepto:330",
  "categoria": "insumos",
  "importe": 3412.91,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n100): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 101,
  "clave": "concepto:354",
  "categoria": "insumos",
  "importe": 3412.91,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n101): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 102,
  "clave": "concepto:100",
  "categoria": "insumos",
  "importe": 9499.8,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n102): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 103,
  "clave": "concepto:218",
  "categoria": "insumos",
  "importe": 9499.8,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n103): Compras nacionales: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 104,
  "clave": "concepto:238",
  "categoria": "insumos",
  "importe": 14249.7,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n104): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 105,
  "clave": "concepto:300",
  "categoria": "insumos",
  "importe": 15041.35,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n105): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 106,
  "clave": "concepto:302",
  "categoria": "insumos",
  "importe": 5699.88,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n106): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 107,
  "clave": "concepto:341",
  "categoria": "insumos",
  "importe": 22800,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n107): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 108,
  "clave": "gasto:4818c530-b581-4453-99ee-9f44411ff5ba",
  "categoria": "insumos",
  "importe": 839.6,
  "rfc": "HCM260306B93",
  "codigo": "502-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n108): Compras nacionales. Insumo de alimentos o bebidas; se queda en memo para no duplicar el costo de venta."
 },
 {
  "n": 109,
  "clave": "concepto:322",
  "categoria": "inversiones",
  "importe": 15900,
  "rfc": "CMS230321FI8",
  "codigo": "155-01-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n109): Mobiliario y equipo. Banco alto de madera para la tienda; inversión, no gasto."
 },
 {
  "n": 111,
  "clave": "gasto:600af948-3a53-4ecf-b0fb-d8313940945a",
  "categoria": "mantenimiento",
  "importe": 313,
  "rfc": "HCM260306B93",
  "codigo": "602-56-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n111): Mantenimiento y conservación de la tienda."
 },
 {
  "n": 112,
  "clave": "gasto:a26b524f-61f1-46e8-86d2-f5b7a9d27bf2",
  "categoria": "mantenimiento",
  "importe": 150,
  "rfc": "HCM260306B93",
  "codigo": "602-56-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n112): Mantenimiento y conservación de la tienda."
 },
 {
  "n": 113,
  "clave": "concepto:247",
  "categoria": "marketing",
  "importe": 4000,
  "rfc": "CMS230321FI8",
  "codigo": "602-61-102",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n113): Marketing local y publicidad. Evento o publicidad local de la tienda."
 },
 {
  "n": 114,
  "clave": "concepto:245",
  "categoria": "marketing",
  "importe": 2223.97,
  "rfc": "CMS230321FI8",
  "codigo": "602-61-102",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n114): Marketing local y publicidad. Evento o publicidad local de la tienda."
 },
 {
  "n": 115,
  "clave": "concepto:246",
  "categoria": "marketing",
  "importe": 4801.74,
  "rfc": "CMS230321FI8",
  "codigo": "602-61-102",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n115): Marketing local y publicidad. Evento o publicidad local de la tienda."
 },
 {
  "n": 116,
  "clave": "concepto:364",
  "categoria": "marketing",
  "importe": 4500,
  "rfc": "HCM260306B93",
  "codigo": "603-61-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n116): Propaganda y publicidad (oficina). Caja luminosa con marca; la factura es de Oficina."
 },
 {
  "n": 117,
  "clave": "concepto:232",
  "categoria": "marketing",
  "importe": 5000,
  "rfc": "CMS230321FI8",
  "codigo": "602-61-102",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n117): Marketing local y publicidad: misma cuenta que ya estaba confirmada; solo cambió un dato del documento (pagos o estado) y se reconfirma."
 },
 {
  "n": 118,
  "clave": "gasto:fafc7ecb-0112-45de-818a-8d329bfb9758",
  "categoria": "marketing",
  "importe": 5070,
  "rfc": "HCM260306B93",
  "codigo": "602-61-102",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n118): Marketing local y publicidad. Evento o publicidad local de la tienda."
 },
 {
  "n": 119,
  "clave": "gasto:55f98d93-9890-4792-8ce6-526d053dee55",
  "categoria": "otros",
  "importe": 555.85,
  "rfc": "HCM260306B93",
  "codigo": "602-84-101",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n119): Consumibles y equipo menor. Compra de Amazon sin detalle; propuesta aceptada por Sebastián."
 },
 {
  "n": 120,
  "clave": "gasto:4f2bc422-23ed-45df-9097-02b4779a3f3d",
  "categoria": "otros",
  "importe": 28,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n120): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 121,
  "clave": "gasto:6c880b21-27f5-42ee-8e1c-d717c61efdb5",
  "categoria": "otros",
  "importe": 28,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n121): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 122,
  "clave": "gasto:52b84e9f-ed69-4154-9162-b4c6f6752082",
  "categoria": "otros",
  "importe": 42,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n122): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 123,
  "clave": "concepto:342",
  "categoria": "otros",
  "importe": 703.51,
  "rfc": "HCM260306B93",
  "codigo": "603-48-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n123): Combustibles y lubricantes. Gasolina reembolsada en oficina."
 },
 {
  "n": 124,
  "clave": "concepto:343",
  "categoria": "otros",
  "importe": 750.89,
  "rfc": "HCM260306B93",
  "codigo": "603-48-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n124): Combustibles y lubricantes. Gasolina reembolsada en oficina."
 },
 {
  "n": 125,
  "clave": "concepto:344",
  "categoria": "otros",
  "importe": 725.22,
  "rfc": "HCM260306B93",
  "codigo": "603-48-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n125): Combustibles y lubricantes. Gasolina reembolsada en oficina."
 },
 {
  "n": 126,
  "clave": "concepto:358",
  "categoria": "otros",
  "importe": 744.72,
  "rfc": "HCM260306B93",
  "codigo": "603-48-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n126): Combustibles y lubricantes. Gasolina reembolsada en oficina."
 },
 {
  "n": 132,
  "clave": "gasto:27ee073c-2450-4d01-883a-a2dc809a3ac5",
  "categoria": "otros",
  "importe": 90,
  "rfc": "HCM260306B93",
  "codigo": "602-16-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n132): Transporte. Viaje de Uber de la tienda; propuesta aceptada por Sebastián."
 },
 {
  "n": 133,
  "clave": "gasto:51c66f8e-a0a1-490e-ab0d-955e057a2c31",
  "categoria": "otros",
  "importe": 90,
  "rfc": "HCM260306B93",
  "codigo": "602-16-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n133): Transporte. Viaje de Uber de la tienda; propuesta aceptada por Sebastián."
 },
 {
  "n": 135,
  "clave": "concepto:276",
  "categoria": "renta",
  "importe": 30000,
  "rfc": "HCM260306B93",
  "codigo": "602-45-101",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n135): Renta de locales con arrendador persona física, igual que la renta de octubre."
 },
 {
  "n": 136,
  "clave": "concepto:278",
  "categoria": "renta",
  "importe": 30000,
  "rfc": "HCM260306B93",
  "codigo": "602-45-101",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n136): Renta de locales con arrendador persona física, igual que la renta de octubre."
 },
 {
  "n": 137,
  "clave": "ajuste:0f421890-fae7-4711-be11-36146697e958",
  "categoria": "renta",
  "importe": 30000,
  "rfc": "HCM260306B93",
  "codigo": "602-45-101",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n137): Renta de locales con arrendador persona física. Ajuste manual de renta de octubre; Sebastián revisará aparte si duplica la factura."
 },
 {
  "n": 138,
  "clave": "concepto:277",
  "categoria": "servicios",
  "importe": 600,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n138): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 139,
  "clave": "concepto:279",
  "categoria": "servicios",
  "importe": 600,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n139): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 140,
  "clave": "concepto:280",
  "categoria": "servicios",
  "importe": 24695.82,
  "rfc": "HCM260306B93",
  "codigo": "602-52-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n140): Energía eléctrica. Recibo de CFE de la tienda."
 },
 {
  "n": 141,
  "clave": "gasto:d5f68f61-1799-44d2-bcd5-88466706c290",
  "categoria": "servicios",
  "importe": 42,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n141): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 142,
  "clave": "gasto:b5048f44-6a0e-43c3-b892-27c8e46e4bb3",
  "categoria": "servicios",
  "importe": 31,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n142): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 143,
  "clave": "gasto:327b3267-0853-427e-a0ff-c56e9c258e88",
  "categoria": "servicios",
  "importe": 42,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n143): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 144,
  "clave": "gasto:83a099a9-f112-4054-86d4-24843654f27c",
  "categoria": "servicios",
  "importe": 14,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n144): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 145,
  "clave": "gasto:400a122a-dfa5-4e91-8c1d-3e45161f0c2c",
  "categoria": "servicios",
  "importe": 28,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n145): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 146,
  "clave": "gasto:bdb64268-e7cb-4da6-b309-59c9d81839d4",
  "categoria": "servicios",
  "importe": 14,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n146): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 147,
  "clave": "gasto:c37226c4-acc9-449a-ba08-406a0beb9ceb",
  "categoria": "servicios",
  "importe": 138,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n147): Agua para la operación, igual que los garrafones y el agua de octubre."
 },
 {
  "n": 148,
  "clave": "concepto:20",
  "categoria": "servicios",
  "importe": 3004.03,
  "rfc": "HCM260306B93",
  "codigo": "602-48-101",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n148): Gas LP, igual que Sonigas en octubre."
 },
 {
  "n": 149,
  "clave": "gasto:083abc9a-95b9-47b3-b5e8-84c344c9e7fb",
  "categoria": "servicios",
  "importe": 1020,
  "rfc": "HCM260306B93",
  "codigo": "602-50-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n149): Teléfono e internet, igual que Totalplay en octubre."
 },
 {
  "n": 150,
  "clave": "ajuste:8af54789-9e92-4634-abe8-d2f26129132d",
  "categoria": "servicios",
  "importe": 1200,
  "rfc": "HCM260306B93",
  "codigo": "602-51-000",
  "motivo": "CUENTAS-PENDIENTES-20261112 aprobado por Sebastián el 12/11/2026 (n150): Agua. Ajuste manual de agua de octubre; Sebastián revisará aparte si duplica la factura."
 }
]$plan$::jsonb
) as x(n integer,clave text,categoria text,importe numeric,rfc text,codigo text,motivo text);

-- Aplica el plan. Solo inserta asignaciones por la función oficial; no modifica facturas, gastos, pagos ni efectivo.
create or replace function pg_temp.aplicar_cuentas_pendientes() returns integer language plpgsql as $aplicar$
declare autor uuid; linea record; m public.contabilidad_movimientos; a public.contabilidad_actual; sol uuid; nuevas integer:=0;
 v_lote constant text:='CUENTAS-PENDIENTES-20261112';
begin
 -- SQL Editor atribuye la operación al administrador que la aprobó.
 select p.id into strict autor from public.perfiles p join auth.users u on u.id=p.id
 where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',autor,'role','authenticated')::text,true);
 -- Primero se revisa TODO; si algo cambió desde la revisión, no se guarda nada.
 for linea in select * from plan_pendientes order by n loop
  select * into m from public.contabilidad_movimientos mv where mv.clave=linea.clave;
  if not found then raise exception 'n% (%): ya no está vigente (cancelado, anulado o borrado). Nada se guardó.',linea.n,linea.clave;end if;
  if coalesce(m.categoria,'(sin categoría)')<>linea.categoria or m.importe<>linea.importe then
   raise exception 'n% (%): cambió la categoría o el importe (% / %, se revisó % / %). Nada se guardó.',linea.n,linea.clave,m.categoria,m.importe,linea.categoria,linea.importe;end if;
  if m.rfc is not null and m.rfc<>linea.rfc then raise exception 'n% (%): la razón social del documento es %, el plan dice %. Nada se guardó.',linea.n,linea.clave,m.rfc,linea.rfc;end if;
  select * into a from public.contabilidad_actual ac where ac.clave=linea.clave;
  if a.codigo is not null and (a.codigo<>linea.codigo or a.rfc<>linea.rfc) and a.id is distinct from md5(v_lote||linea.clave||linea.codigo)::uuid then
   raise exception 'n% (%): ya tiene otra cuenta confirmada (% %). Nada se guardó.',linea.n,linea.clave,a.rfc,a.codigo;end if;
 end loop;
 for linea in select * from plan_pendientes order by n loop
  select * into strict m from public.contabilidad_movimientos mv where mv.clave=linea.clave;
  select * into a from public.contabilidad_actual ac where ac.clave=linea.clave;
  sol:=md5(v_lote||linea.clave||linea.codigo)::uuid;
  if a.codigo is not distinct from linea.codigo and a.rfc is not distinct from linea.rfc and a.huella is not distinct from m.huella then continue;end if;
  perform public.asignar_cuenta_contable(sol,linea.clave,a.id,m.huella,linea.rfc,linea.codigo,linea.motivo,true);
  nuevas:=nuevas+1;
 end loop;
 return nuevas;
end $aplicar$;

-- Comprobación: las 138 quedan con su cuenta y razón social, y con la huella actual del documento.
create or replace function pg_temp.verificar_cuentas_pendientes() returns integer language plpgsql as $verificar$
declare faltan integer;
begin
 select count(*) into faltan from plan_pendientes p
 left join public.contabilidad_movimientos m on m.clave=p.clave
 left join public.contabilidad_actual a on a.clave=p.clave
 where a.codigo is distinct from p.codigo or a.rfc is distinct from p.rfc or a.huella is distinct from m.huella;
 if faltan>0 then raise exception 'FALLÓ: % registros no quedaron con su cuenta.',faltan;end if;
 return (select count(*) from plan_pendientes);
end $verificar$;

do $pruebas$
declare antes jsonb; despues jsonb; primera integer; segunda integer; filas_lote integer;
begin
 -- Fotografía de los orígenes: deben quedar idénticos.
 select jsonb_build_array(
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.facturas t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.factura_conceptos t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.gastos_caja_chica t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.gastos_mes t)) into antes;
 primera:=pg_temp.aplicar_cuentas_pendientes();
 if primera<>138 then raise exception 'FALLÓ: se esperaban 138 asignaciones nuevas y fueron %.',primera;end if;
 perform pg_temp.verificar_cuentas_pendientes();
 select count(*) into filas_lote from public.contabilidad_asignaciones where motivo like 'CUENTAS-PENDIENTES-20261112%';
 segunda:=pg_temp.aplicar_cuentas_pendientes();
 if segunda<>0 or (select count(*) from public.contabilidad_asignaciones where motivo like 'CUENTAS-PENDIENTES-20261112%')<>filas_lote then raise exception 'FALLÓ: repetir el lote duplicó asignaciones.';end if;
 select jsonb_build_array(
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.facturas t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.factura_conceptos t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.gastos_caja_chica t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.gastos_mes t)) into despues;
 if antes is distinct from despues then raise exception 'FALLÓ: cambió una factura o gasto.';end if;
end $pruebas$;
select 'PRUEBAS OK — 138 equivalencias · 26 reconfirmadas · insumos en 502 (memo) · facturas, gastos y pagos sin cambios · repetir no duplica · ensayo reversible' as resultado;
rollback;
