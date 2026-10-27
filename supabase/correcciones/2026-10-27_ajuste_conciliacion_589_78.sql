-- Ejecutar COMPLETO después de la migración de ajustes de conciliación.
-- Ensayo: ROLLBACK final. Tras validar, cambiar SOLO esa última línea a COMMIT.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.ajustes_boveda,public.cajas,public.movimientos,public.gastos_caja_chica,
 public.facturas,public.pagos,public.cierres_dia,public.recolecciones_corporativo IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE resultado_ajuste(resultado text,saldo_antes numeric,saldo_despues numeric,
 recoleccion_pendiente numeric,remanente_tras_recoleccion numeric,ajuste numeric) ON COMMIT DROP;
DO $$
DECLARE
 s constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 autor constant uuid:='fab8c3e1-636d-45bc-80e3-a7185ebc75fd';
 entrega constant uuid:='8202bc03-642f-41b5-98c5-5271f1e416e9';
 ref constant text:='CONCILIACION-BOVEDA-20261027-58978';
 m public.movimientos; b uuid; antes numeric; despues numeric; pendiente numeric; protegido jsonb;
BEGIN
 IF has_table_privilege('authenticated','public.ajustes_boveda','insert,update,delete') OR has_table_privilege('anon','public.ajustes_boveda','select,insert,update,delete') THEN RAISE EXCEPTION 'Permisos inesperados en ajustes; revisar.';END IF;
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Ejecuta como postgres.';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=autor AND activo AND rol::text='admin') THEN RAISE EXCEPTION 'Falta el administrador autorizado.';END IF;
 SELECT id INTO b FROM public.cajas WHERE sucursal_id=s AND tipo='boveda';
 SELECT * INTO m FROM public.movimientos WHERE id=entrega;
 IF b IS NULL OR m.id IS NULL OR m.sucursal_id<>s OR m.caja_origen_id<>b OR m.tipo<>'salida_corporativo' OR m.monto<>21980 OR m.estado NOT IN ('pendiente','confirmado') THEN RAISE EXCEPTION 'La entrega de $21,980 no coincide; revisar.';END IF;
 pendiente:=CASE WHEN m.estado='pendiente' THEN m.monto ELSE 0 END;
 SELECT saldo INTO antes FROM public.saldos_cajas WHERE caja_id=b;
 IF EXISTS(SELECT 1 FROM public.ajustes_boveda WHERE solicitud=ref) THEN
  IF NOT EXISTS(SELECT 1 FROM public.ajustes_boveda WHERE solicitud=ref AND sucursal_id=s AND importe=589.78 AND autor_id=autor) THEN RAISE EXCEPTION 'La referencia ya tiene otros datos.';END IF;
  INSERT INTO resultado_ajuste VALUES('YA APLICADO · SIN OTRO DESCUENTO',antes,antes,pendiente,antes-pendiente,589.78);
  RETURN;
 END IF;
 IF antes IS NULL OR antes-pendiente<>7958.78 THEN RAISE EXCEPTION 'Cambió el saldo: bóveda %, pendiente %. No se fuerza el objetivo.',antes,pendiente;END IF;
 IF EXISTS(SELECT 1 FROM public.cierres_dia WHERE sucursal_id=s AND fecha=public.hoy_mx()) THEN RAISE EXCEPTION 'El día ya está cerrado; revisar antes de registrar un efecto nuevo.';END IF;
 SELECT jsonb_build_object(
 'cajas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.cajas x),
 'movimientos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos x),
 'gastos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.gastos_caja_chica x),
 'facturas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.facturas x),
 'pagos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos x),
 'cierres',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.cierres_dia x),
 'entregas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.recolecciones_corporativo x)) INTO protegido;
 INSERT INTO public.ajustes_boveda(sucursal_id,solicitud,importe,saldo_antes,saldo_despues,motivo,autor_id)
 VALUES(s,ref,589.78,antes,antes-589.78,'Ajuste de conciliación autorizado expresamente por Sebastián para cerrar la diferencia de bóveda. Causa declarada por el usuario: error técnico por fallas de internet y órdenes canceladas; no verificada con evidencia de órdenes específicas. Se registran $589.78 (no $589.70) para alcanzar $7,369 después de la recolección existente de $21,980. Se excluyen las ventas de hoy y los $500 de caja de venta. No modifica ventas, gastos, P&L, conteos ni entregas históricas. No confirma ni duplica la recolección pendiente.',autor);
 SELECT saldo INTO despues FROM public.saldos_cajas WHERE caja_id=b;
 IF antes-despues<>589.78 OR despues-pendiente<>7369 THEN RAISE EXCEPTION 'El efecto no coincide; todo revertido.';END IF;
 IF protegido IS DISTINCT FROM (SELECT jsonb_build_object(
 'cajas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.cajas x),
 'movimientos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos x),
 'gastos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.gastos_caja_chica x),
 'facturas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.facturas x),
 'pagos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos x),
 'cierres',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.cierres_dia x),
 'entregas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.recolecciones_corporativo x))) THEN RAISE EXCEPTION 'Cambió un registro protegido; todo revertido.';END IF;
 INSERT INTO resultado_ajuste VALUES('AJUSTE VALIDADO',antes,despues,pendiente,despues-pendiente,589.78);
END $$;
SELECT *, 'ROLLBACK ensaya; COMMIT guarda ejecutando siempre el archivo completo' AS modo FROM resultado_ajuste;
ROLLBACK;
