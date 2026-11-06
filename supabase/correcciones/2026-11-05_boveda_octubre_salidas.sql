-- Corrección de 6 cierres de bóveda de Dodo La Calma (Dodo-1), octubre 2026 (05/11/2026).
--
-- Qué pasó: hasta el 18/10 la bóveda se cerraba contando solo el fondo y el efectivo que había entrado ese día ya
-- estaba apartado para corporativo. Se mandó en las salidas semanales (folios 0003, 003 y 004), pero el cierre se
-- guardó con "Salidas a corporativo $0 · Sin salida", así que su diferencia de bóveda quedó como faltante. La
-- diferencia se guarda al cerrar y no se recalcula; el P&L la sigue leyendo como faltante de efectivo (−$20,282.84
-- en Otros gastos de octubre). No faltó efectivo: el saldo de la bóveda ya se concilió el 27/10.
--
--   Cierre   Esperado    Contado    Diferencia   Salida que se llevó el efectivo
--   04/10    5,000.00    2,500.00   −2,500.00    0003 (05/10, corrección del 06/10)
--   07/10    5,729.00    4,500.00   −1,229.00    003  (13/10)
--   12/10    7,962.00    4,500.00   −3,462.00    003  (13/10)
--   14/10    5,754.00    4,500.00   −1,254.00    004  (19/10)
--   16/10    7,581.84    4,500.00   −3,081.84    004  (19/10)
--   18/10   13,256.00    4,500.00   −8,756.00    004  (19/10)
--
-- Qué hace: en cada uno de esos 6 cierres registra como "salida a corporativo del día" lo que no se anotó
-- (deposito_dia), con el folio y la fecha de la salida (deposito_ficha / deposito_fecha). Su diferencia queda en $0.
-- No cambia lo contado, el saldo de la bóveda, las salidas, las recolecciones ni otros cierres.
-- Antes de tocar nada revisa que cada cierre tenga exactamente los importes de arriba y que existan las 3 salidas.
--
-- Cómo correrla (SQL Editor de Supabase, proyecto de producción):
--   · Tal como está, SOLO SIMULA: termina con "SIMULACIÓN OK — …" (un error a propósito que deshace todo).
--   · Si la simulación sale bien, cambia  v_aplicar boolean := false  a  true  y vuelve a correrla.
--   · Si ya se aplicó, termina con "YA APLICADO" y no cambia nada.

do $$
declare
  v_aplicar boolean := false;   -- ← cámbialo a true para aplicar
  v_suc constant uuid := '260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';   -- Dodo La Calma (Dodo-1)
  v_nota constant text := ' · corrección 05/11/2026: salida no anotada en el cierre';
  e record; c public.cierres_dia; s public.movimientos;
  v_hechos integer := 0; v_total numeric := 0; v_n integer;
begin
  select count(*) into v_n from public.sucursales where id = v_suc;
  if v_n <> 1 then raise exception 'No encontré la sucursal Dodo La Calma (Dodo-1).'; end if;

  for e in
    select * from (values
      (date '2026-10-04',  5000.00::numeric, 2500.00::numeric, -2500.00::numeric, '0003'),
      (date '2026-10-07',  5729.00, 4500.00, -1229.00, '003'),
      (date '2026-10-12',  7962.00, 4500.00, -3462.00, '003'),
      (date '2026-10-14',  5754.00, 4500.00, -1254.00, '004'),
      (date '2026-10-16',  7581.84, 4500.00, -3081.84, '004'),
      (date '2026-10-18', 13256.00, 4500.00, -8756.00, '004')
    ) as t(fecha, esperado, contado, diferencia, folio)
    order by fecha
  loop
    select * into c from public.cierres_dia where sucursal_id = v_suc and fecha = e.fecha for update;
    if c.id is null then raise exception 'Falta el cierre del %.', e.fecha; end if;

    select * into s from public.movimientos
     where sucursal_id = v_suc and tipo = 'salida_corporativo' and folio = e.folio
     order by creado_en limit 1;
    if s.id is null then raise exception 'No encontré la salida a corporativo con folio %.', e.folio; end if;

    -- Ya corregido: diferencia en cero con la misma referencia.
    if c.boveda_diferencia = 0 and c.deposito_ficha = e.folio || v_nota then
      v_hechos := v_hechos + 1;
      continue;
    end if;

    if c.boveda_esperado <> e.esperado or c.boveda_contado <> e.contado or c.boveda_diferencia <> e.diferencia
       or c.deposito_dia <> 0 or c.deposito_ficha is not null then
      raise exception 'El cierre del % cambió (esperado %, contado %, diferencia %, salida %, folio %): revisa antes de seguir; no se aplicó nada.',
        e.fecha, c.boveda_esperado, c.boveda_contado, c.boveda_diferencia, c.deposito_dia, c.deposito_ficha;
    end if;

    update public.cierres_dia
       set deposito_dia   = deposito_dia - e.diferencia,
           deposito_ficha = e.folio || v_nota,
           deposito_fecha = coalesce(s.confirmado_en, s.creado_en)
     where id = c.id;

    select * into c from public.cierres_dia where id = c.id;
    if c.boveda_diferencia <> 0 or c.boveda_contado <> e.contado then
      raise exception 'El cierre del % quedaría con diferencia % (contado %): no se aplicó nada.', e.fecha, c.boveda_diferencia, c.boveda_contado;
    end if;
    v_total := v_total + e.diferencia;
  end loop;

  if v_hechos = 6 then
    raise notice 'YA APLICADO — los 6 cierres ya tienen diferencia $0 con su folio; no se cambió nada.';
    return;
  end if;
  if v_hechos > 0 then raise exception 'Solo % de los 6 cierres estaban corregidos: revisa antes de seguir; no se aplicó nada.', v_hechos; end if;
  if v_total <> -20282.84 then raise exception 'La suma corregida es % y debe ser −20,282.84: no se aplicó nada.', v_total; end if;

  if not v_aplicar then
    raise exception 'SIMULACIÓN OK — 6 cierres (04, 07, 12, 14, 16 y 18/10) quedarían con diferencia $0; se quitan $20,282.84 de faltantes de bóveda. Cambia v_aplicar a true para aplicar.';
  end if;
  raise notice 'APLICADO — 6 cierres de bóveda de octubre quedaron con diferencia $0 (folios 0003, 003 y 004).';
end $$;
