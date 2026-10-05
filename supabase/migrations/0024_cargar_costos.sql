-- Carga de costos desde el Excel del menú (Ventas → Costos → Cargar costos desde Excel).
--   · costos_equivalencias: qué producto de Dodo IS corresponde a un renglón del Excel (nombre + tamaño) cuando el
--     nombre no coincide; el admin lo elige una vez y las siguientes cargas lo emparejan solo.
--   · cargar_costos(): guarda de una vez los costos con su fecha de vigencia. Si ya había costo de ese producto con esa
--     fecha y cambia, queda en la bitácora correcciones_costo (como corregir_costo). Pone categoría y tamaño a los
--     productos que no los tenían, y guarda las equivalencias elegidas.
-- Requiere 0001–0023.

create table costos_equivalencias (
  clave_excel     text not null check (trim(clave_excel) <> ''),
  tamano          text not null check (tamano in ('P', 'M', 'G')),
  dodo_id         integer not null references productos_venta(dodo_id),
  actualizado_por uuid references perfiles(id) default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  primary key (clave_excel, tamano)
);
alter table costos_equivalencias enable row level security;
create policy ver_costos_equivalencias on costos_equivalencias for select using (ve_catalogo_ventas());
-- Se escribe solo por cargar_costos().

-- p_costos: [{dodo_id, costo, nota, categoria, tamano}]; p_equivalencias: [{clave_excel, tamano, dodo_id}].
create or replace function cargar_costos(p_fecha date, p_fuente text, p_costos jsonb, p_equivalencias jsonb default '[]') returns integer
language plpgsql security definer set search_path = public as $$
declare
  c jsonb; e jsonb; v_id integer; v_costo numeric; v_previo costos_producto; v_n integer := 0;
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador carga costos.'; end if;
  if p_fecha is null then raise exception 'Elige desde qué fecha valen los costos.'; end if;
  if jsonb_typeof(coalesce(p_costos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_costos, '[]')) = 0 then
    raise exception 'No hay costos que cargar.';
  end if;

  for c in select * from jsonb_array_elements(p_costos) loop
    v_id := (c->>'dodo_id')::integer;
    v_costo := round((c->>'costo')::numeric, 2);
    if v_costo is null or v_costo < 0 then raise exception 'Costo inválido para el producto %', v_id; end if;
    if not exists (select 1 from productos_venta where dodo_id = v_id) then raise exception 'El producto % no existe', v_id; end if;

    select * into v_previo from costos_producto where dodo_id = v_id and vigente_desde = p_fecha for update;
    if found then
      if v_previo.costo <> v_costo then
        insert into correcciones_costo (costo_id, costo_anterior, costo_nuevo, nota_anterior, corregido_por)
        values (v_previo.id, v_previo.costo, v_costo, v_previo.nota, auth.uid());
      end if;
      update costos_producto set costo = v_costo, fuente = p_fuente, nota = c->>'nota' where id = v_previo.id;
    else
      insert into costos_producto (dodo_id, costo, vigente_desde, fuente, nota)
      values (v_id, v_costo, p_fecha, p_fuente, c->>'nota');
    end if;

    update productos_venta
       set categoria = coalesce(categoria, (c->>'categoria')::categoria_producto),
           tamano = coalesce(tamano, nullif(c->>'tamano', ''))
     where dodo_id = v_id and (categoria is null or tamano is null);
    v_n := v_n + 1;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_equivalencias, '[]')) loop
    insert into costos_equivalencias (clave_excel, tamano, dodo_id)
    values (e->>'clave_excel', e->>'tamano', (e->>'dodo_id')::integer)
    on conflict (clave_excel, tamano) do update set dodo_id = excluded.dodo_id, actualizado_por = auth.uid(), actualizado_en = now();
  end loop;
  return v_n;
end $$;
revoke execute on function cargar_costos(date, text, jsonb, jsonb) from public, anon;
grant execute on function cargar_costos(date, text, jsonb, jsonb) to authenticated;
