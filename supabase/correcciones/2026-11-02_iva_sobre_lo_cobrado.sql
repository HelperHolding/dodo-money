-- IVA sobre lo cobrado en días importados con "Datos brutos".
-- El IVA se calculaba sobre los precios de los productos; en pedidos cobrados en $0 o con descuento al pedido entero
-- (el Excel no lo reparte en los renglones) eso daba IVA de más. Ej.: 21/09 en La Calma, $692 cobrados y $1,467 de IVA.
-- Corrige pedidos.iva, ventas_dia.iva y ventas_dia_desglose.iva de esos días. No toca totales ni días de la API.
-- Correr COMPLETO en el SQL Editor del proyecto de PRODUCCIÓN.
-- Ensayo: termina en ROLLBACK y muestra qué cambiaría. Si se ve bien, cambiar SOLO la última línea a COMMIT y volver a correr.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.pedidos, public.ventas_dia, public.ventas_dia_desglose IN SHARE ROW EXCLUSIVE MODE;

-- 1. Pedidos de días de Datos brutos cuyos productos no suman lo cobrado: IVA sobre lo cobrado.
CREATE TEMP TABLE pedidos_iva ON COMMIT DROP AS
WITH lineas AS (SELECT pedido_id, sum(precio) AS suma FROM public.pedido_productos GROUP BY pedido_id)
SELECT p.dodo_id, p.sucursal_id, p.fecha, round(p.total * 16 / 116, 2) AS iva_nuevo
FROM public.pedidos p
JOIN public.ventas_dia v ON v.sucursal_id = p.sucursal_id AND v.fecha = p.fecha
JOIN public.importaciones_ventas i ON i.id = v.importacion_id AND i.formato = 'datos_brutos'
LEFT JOIN lineas l ON l.pedido_id = p.dodo_id
WHERE round(coalesce(l.suma, 0), 2) <> round(p.total, 2)
  AND p.iva <> round(p.total * 16 / 116, 2);

UPDATE public.pedidos p SET iva = c.iva_nuevo FROM pedidos_iva c WHERE p.dodo_id = c.dodo_id;

-- 2. El IVA del día y de su desglose vuelve a ser la suma de sus pedidos con venta (entregados, sin comida del personal),
--    con los mismos tipos que la importación (lib/ventas/pedidos.ts → tiposDesglose).
CREATE TEMP TABLE dias_iva ON COMMIT DROP AS
SELECT v.id, v.sucursal_id, v.fecha, v.total, v.iva AS iva_antes,
       (SELECT coalesce(sum(p.iva), 0) FROM public.pedidos p
         WHERE p.sucursal_id = v.sucursal_id AND p.fecha = v.fecha AND p.estado = 'entregado' AND p.tipo <> 'personal') AS iva_nuevo
FROM public.ventas_dia v
WHERE (v.sucursal_id, v.fecha) IN (SELECT DISTINCT sucursal_id, fecha FROM pedidos_iva);

UPDATE public.ventas_dia v SET iva = d.iva_nuevo FROM dias_iva d WHERE v.id = d.id;

UPDATE public.ventas_dia_desglose g SET iva = x.iva
FROM (
  SELECT d.id AS ventas_dia_id, t.tipo, sum(p.iva) AS iva
  FROM dias_iva d
  JOIN public.pedidos p ON p.sucursal_id = d.sucursal_id AND p.fecha = d.fecha AND p.estado = 'entregado' AND p.tipo <> 'personal'
  CROSS JOIN LATERAL unnest(array_remove(ARRAY[
    CASE WHEN p.tipo = 'entrega' THEN 'entrega' WHEN p.origen IN ('app', 'sitio') THEN 'llevadera' ELSE 'restaurante' END,
    CASE WHEN p.origen = 'sitio' THEN 'sitio' END,
    CASE WHEN p.origen = 'app' THEN 'app' END,
    CASE WHEN p.agregador IS NOT NULL AND p.agregador <> '' THEN 'agregador' END
  ], NULL)) AS t(tipo)
  GROUP BY d.id, t.tipo
) x
WHERE g.ventas_dia_id = x.ventas_dia_id AND g.tipo = x.tipo;

-- 3. Comprobación: cada día corregido queda en 16/116 de lo cobrado (centavos de redondeo por producto).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ventas_dia v JOIN dias_iva d ON d.id = v.id WHERE abs(v.iva - v.total * 16 / 116) > 1) THEN
    RAISE EXCEPTION 'Un día corregido no quedó en 16/116 de su total; todo revertido.';
  END IF;
END $$;

SELECT s.nombre, d.fecha, d.total, d.iva_antes, d.iva_nuevo, d.iva_antes - d.iva_nuevo AS iva_de_mas_quitado,
       (SELECT count(*) FROM pedidos_iva c WHERE c.sucursal_id = d.sucursal_id AND c.fecha = d.fecha) AS pedidos_corregidos,
       'ROLLBACK ensaya; COMMIT guarda ejecutando siempre el archivo completo' AS modo
FROM dias_iva d JOIN public.sucursales s ON s.id = d.sucursal_id
ORDER BY d.fecha DESC, s.nombre;
ROLLBACK;
