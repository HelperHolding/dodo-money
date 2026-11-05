-- Inventario de artículos propios del almacén (por ahora, uniformes de Dodo). Los insumos de Dodo IS no se guardan:
-- se leen en vivo de la API. Corporativo consulta; solo admin ajusta cantidades y cada ajuste queda en el historial.
-- Carga inicial: resumen de inventario de Zoho (Nueva Comercializadora The Coffee) al 05/11/2026.
-- Requiere 0011 (ve_compras, edita_compras) y perfiles.
begin;
set local lock_timeout='5s';

create table public.inventario_articulos(
 sku text primary key check(sku ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
 nombre text not null check(length(trim(nombre)) between 1 and 200),
 grupo text not null default 'uniformes' check(grupo in ('uniformes')),
 zoho_item_id text unique check(zoho_item_id is null or zoho_item_id ~ '^[0-9]{6,30}$'),
 cantidad integer not null default 0 check(cantidad between 0 and 100000),
 actualizado_en timestamptz not null default now(),
 actualizado_por uuid references public.perfiles(id)
);

create table public.inventario_movimientos(
 id bigint generated always as identity primary key,
 sku text not null references public.inventario_articulos(sku),
 anterior integer not null,
 nueva integer not null check(nueva between 0 and 100000),
 nota text check(nota is null or length(nota) <= 300),
 registrado_en timestamptz not null default now(),
 registrado_por uuid references public.perfiles(id)
);
create index inventario_movimientos_sku on public.inventario_movimientos(sku, registrado_en desc);

alter table public.inventario_articulos enable row level security;
alter table public.inventario_movimientos enable row level security;
create policy ver_inventario on public.inventario_articulos for select using(public.ve_compras());
create policy ver_inventario_movimientos on public.inventario_movimientos for select using(public.ve_compras());
grant select on public.inventario_articulos, public.inventario_movimientos to authenticated;

-- Cambia la cantidad contada de un artículo (conteo físico o salida). Sin cambio no registra nada.
create or replace function public.ajustar_inventario(p_sku text, p_cantidad integer, p_nota text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_anterior integer;
begin
 if not public.edita_compras() then raise exception 'Solo administración ajusta el inventario.'; end if;
 if p_cantidad is null or p_cantidad < 0 or p_cantidad > 100000 then raise exception 'Cantidad inválida.'; end if;
 select cantidad into v_anterior from public.inventario_articulos where sku = p_sku for update;
 if not found then raise exception 'Artículo no encontrado.'; end if;
 if v_anterior = p_cantidad then return; end if;
 update public.inventario_articulos set cantidad = p_cantidad, actualizado_en = now(), actualizado_por = auth.uid() where sku = p_sku;
 insert into public.inventario_movimientos(sku, anterior, nueva, nota, registrado_por)
 values(p_sku, v_anterior, p_cantidad, nullif(left(trim(coalesce(p_nota, '')), 300), ''), auth.uid());
end $$;
revoke all on function public.ajustar_inventario(text, integer, text) from public;
grant execute on function public.ajustar_inventario(text, integer, text) to authenticated;

insert into public.inventario_articulos(sku, nombre, zoho_item_id, cantidad, actualizado_en) values
 ('DOD-UNI-001', 'Mandil Dodo', '6602667000028133177', 8, '2026-11-05 12:00-06'),
 ('DOD-UNI-002', 'Gorra Dodo', '6602667000028133189', 15, '2026-11-05 12:00-06'),
 ('DOD-UNI-003', 'Cofia Dodo', '6602667000028133202', 17, '2026-11-05 12:00-06'),
 ('DOD-UNI-004', 'Playera negra cuello mao CH Dodo', '6602667000028133214', 6, '2026-11-05 12:00-06'),
 ('DOD-UNI-005', 'Playera negra cuello mao M Dodo', '6602667000028133226', 11, '2026-11-05 12:00-06'),
 ('DOD-UNI-006', 'Playera negra cuello mao G Dodo', '6602667000028133238', 7, '2026-11-05 12:00-06'),
 ('DOD-UNI-007', 'Playera negra cuello mao XG Dodo', '6602667000028133250', 4, '2026-11-05 12:00-06'),
 ('DOD-UNI-008', 'Playera gris cuello mao CH Dodo', '6602667000028133262', 8, '2026-11-05 12:00-06'),
 ('DOD-UNI-009', 'Playera gris cuello mao M Dodo', '6602667000028133274', 6, '2026-11-05 12:00-06'),
 ('DOD-UNI-010', 'Playera gris cuello mao G Dodo', '6602667000028133286', 4, '2026-11-05 12:00-06'),
 ('DOD-UNI-011', 'Playera gris cuello mao XG Dodo', '6602667000028133298', 3, '2026-11-05 12:00-06');

commit;
