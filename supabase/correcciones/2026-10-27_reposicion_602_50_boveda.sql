-- Ejecutar el archivo COMPLETO como postgres en Supabase SQL Editor.
-- Ensayo por defecto: ROLLBACK. Tras validar, cambiar SOLO la última línea a COMMIT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.cajas,public.movimientos,public.gastos_caja_chica,public.pagos,
 public.pago_aplicaciones,public.pagos_boveda_eventos,public.pagos_ventas_eventos,
 public.cierres_dia,public.arqueos,public.recolecciones_corporativo IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE reposicion_resultado(resultado text,movimiento_id uuid,monto numeric,
 saldo_boveda_antes numeric,saldo_boveda_despues numeric,saldo_caja_chica_antes numeric,
 saldo_caja_chica_despues numeric) ON COMMIT DROP;
DO $$
DECLARE
 objetivo constant uuid:='ba9e398f-24d6-4bab-a001-164c0b0a981c';
 suc constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 autor constant uuid:='fab8c3e1-636d-45bc-80e3-a7185ebc75fd';
 marca constant text:='REPOSICION-BOVEDA-60250-20261027';
 m public.movimientos; despues public.movimientos; b uuid; chica uuid; s0 numeric;s1 numeric;c0 numeric;c1 numeric;
 antes jsonb; protegidos jsonb; otros jsonb;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Ejecuta como postgres.';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=autor AND activo AND rol::text='admin') THEN RAISE EXCEPTION 'Falta Sebastián como administrador activo.';END IF;
 SELECT * INTO m FROM public.movimientos WHERE id=objetivo FOR UPDATE;
 IF NOT FOUND OR m.sucursal_id<>suc OR m.tipo<>'reposicion_caja_chica' OR m.monto<>602.50 THEN RAISE EXCEPTION 'El movimiento no coincide; no se modificó nada.';END IF;
 SELECT id INTO b FROM public.cajas WHERE sucursal_id=suc AND tipo='boveda';
 SELECT id INTO chica FROM public.cajas WHERE sucursal_id=suc AND tipo='caja_chica';
 IF b IS NULL OR chica IS NULL OR m.caja_destino_id<>chica THEN RAISE EXCEPTION 'Cajas de la reposición distintas de las esperadas.';END IF;
 IF position(marca in coalesce(m.nota,''))>0 THEN
  IF m.estado<>'confirmado' OR m.caja_origen_id<>b OR m.confirmado_por<>autor THEN RAISE EXCEPTION 'La corrección previa no coincide; revisar.';END IF;
  SELECT saldo INTO s1 FROM public.saldos_cajas WHERE caja_id=b;
  SELECT saldo INTO c1 FROM public.saldos_cajas WHERE caja_id=chica;
  INSERT INTO reposicion_resultado VALUES('YA APLICADA · SIN OTRO DESCUENTO',objetivo,m.monto,null,s1,null,c1);
  RETURN;
 END IF;
 IF m.estado<>'pendiente' OR m.confirmado_en IS NOT NULL OR m.confirmado_por IS NOT NULL
 OR m.nota IS DISTINCT FROM 'Reposición por gastos comprobados'
 OR NOT EXISTS(SELECT 1 FROM public.cajas WHERE id=m.caja_origen_id AND sucursal_id=suc AND tipo='corporativo')
 OR m.registrado_por=autor THEN RAISE EXCEPTION 'Cambió el estado, origen, nota o autor de la reposición; revisar.';END IF;
 IF EXISTS(SELECT 1 FROM public.cierres_dia WHERE sucursal_id=suc AND fecha=public.hoy_mx()) THEN RAISE EXCEPTION 'El día está cerrado; revisar antes de aplicar una salida nueva.';END IF;
 SELECT saldo INTO s0 FROM public.saldos_cajas WHERE caja_id=b;
 SELECT saldo INTO c0 FROM public.saldos_cajas WHERE caja_id=chica;
 IF s0 IS NULL OR c0 IS NULL THEN RAISE EXCEPTION 'Falta el saldo de una caja.';END IF;
 -- Ningún gasto se crea, reclasifica, vincula ni repone por inferencia: la autorización
 -- corresponde al movimiento exacto de $602.50. Se guarda su fila original íntegra.
 antes:=to_jsonb(m);
 SELECT jsonb_build_object(
 'gastos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.gastos_caja_chica x),
 'pagos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos x),
 'aplicaciones',(SELECT jsonb_agg(to_jsonb(x) ORDER BY pago_id,factura_id) FROM public.pago_aplicaciones x),
 'eventos_boveda',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos_boveda_eventos x),
 'eventos_ventas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos_ventas_eventos x),
 'cierres',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.cierres_dia x),
 'arqueos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.arqueos x),
 'entregas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.recolecciones_corporativo x)) INTO protegidos;
 SELECT jsonb_agg(to_jsonb(x) ORDER BY id) INTO otros FROM public.movimientos x WHERE id<>objetivo;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',autor,'role','authenticated')::text,true);
 UPDATE public.movimientos SET caja_origen_id=b,
 nota=coalesce(m.nota,'')||E'\n'||marca||'. Sebastián confirmó que los $602.50 salieron físicamente de bóveda para cubrir gastos existentes. Se corrige y confirma esta misma reposición Bóveda a Caja chica; no se crea otro movimiento ni gasto, ni se cambia el P&L. Fecha de captura original conservada; reconocimiento del efecto de efectivo al confirmar. No se atribuyen gastos específicos sin vínculo documentado. Estado original completo: '||antes::text
 WHERE id=objetivo;
 -- La confirmación normal conserva la firma distinta de quien registró y los
 -- controles de disponibilidad; no se desactiva ningún trigger ni permiso.
 PERFORM public.confirmar_movimiento(objetivo,true);
 SELECT * INTO despues FROM public.movimientos WHERE id=objetivo;
 SELECT saldo INTO s1 FROM public.saldos_cajas WHERE caja_id=b;
 SELECT saldo INTO c1 FROM public.saldos_cajas WHERE caja_id=chica;
 IF s0-s1<>602.50 OR c1-c0<>602.50 OR despues.estado<>'confirmado'
 OR despues.confirmado_por<>autor OR despues.caja_origen_id<>b
 OR (to_jsonb(despues)-ARRAY['nota','caja_origen_id','estado','confirmado_por','confirmado_en'])
 IS DISTINCT FROM (antes-ARRAY['nota','caja_origen_id','estado','confirmado_por','confirmado_en']) THEN RAISE EXCEPTION 'Efecto distinto al autorizado; todo revertido.';END IF;
 IF protegidos IS DISTINCT FROM (SELECT jsonb_build_object(
 'gastos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.gastos_caja_chica x),
 'pagos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos x),
 'aplicaciones',(SELECT jsonb_agg(to_jsonb(x) ORDER BY pago_id,factura_id) FROM public.pago_aplicaciones x),
 'eventos_boveda',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos_boveda_eventos x),
 'eventos_ventas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pagos_ventas_eventos x),
 'cierres',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.cierres_dia x),
 'arqueos',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.arqueos x),
 'entregas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.recolecciones_corporativo x)))
 OR otros IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.movimientos x WHERE id<>objetivo) THEN RAISE EXCEPTION 'Cambió un registro protegido; todo revertido.';END IF;
 INSERT INTO reposicion_resultado VALUES('CORRECCIÓN VALIDADA',objetivo,602.50,s0,s1,c0,c1);
END $$;
SELECT *, 'Revisar la última línea: ROLLBACK ensaya; COMMIT guarda el archivo completo' AS modo FROM reposicion_resultado;
ROLLBACK;
