-- Inventory management schema for Supabase.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: objects are created with IF NOT EXISTS / OR REPLACE where possible.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (length(trim(name)) > 0),
  contact_name text,
  email        text,
  phone        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique check (length(trim(sku)) > 0),
  name          text not null check (length(trim(name)) > 0),
  description   text,
  category_id   uuid references public.categories (id) on delete set null,
  supplier_id   uuid references public.suppliers (id) on delete set null,
  unit          text not null default 'pcs',
  cost_price    numeric(12, 2) not null default 0 check (cost_price >= 0),
  sale_price    numeric(12, 2) not null default 0 check (sale_price >= 0),
  -- quantity is maintained by the stock_movements trigger; clients cannot write it.
  quantity      integer not null default 0 check (quantity >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_supplier_idx on public.products (supplier_id);

-- Append-only ledger. Every change to products.quantity is a row here.
create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id) on delete cascade,
  movement_type   text not null check (movement_type in ('receive', 'ship', 'adjust')),
  quantity_change integer not null check (quantity_change <> 0),
  quantity_after  integer,
  note            text,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at      timestamptz not null default now(),
  constraint movement_sign check (
    (movement_type = 'receive' and quantity_change > 0) or
    (movement_type = 'ship'    and quantity_change < 0) or
    (movement_type = 'adjust')
  )
);

create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_created_idx on public.stock_movements (created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- Applies a movement to its product. Runs as the table owner so it can write
-- products.quantity, which the authenticated role is not granted.
-- If the result would go below zero, the products check constraint fails and
-- the whole insert is rolled back.
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_quantity integer;
begin
  update public.products
     set quantity = quantity + new.quantity_change
   where id = new.product_id
  returning quantity into new_quantity;

  if not found then
    raise exception 'Product % does not exist', new.product_id;
  end if;

  new.quantity_after := new_quantity;
  return new;
exception
  when check_violation then
    raise exception 'Not enough stock: this movement would take the quantity below zero'
      using errcode = 'check_violation';
end;
$$;

drop trigger if exists stock_movements_apply on public.stock_movements;
create trigger stock_movements_apply
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Signed-in users share one inventory. Anonymous visitors get nothing.

revoke all on public.categories, public.suppliers, public.products, public.stock_movements from anon;

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.suppliers  to authenticated;

-- Products: every column except quantity (and server-managed timestamps) is writable.
revoke insert, update on public.products from authenticated;
grant select, delete on public.products to authenticated;
grant insert (sku, name, description, category_id, supplier_id, unit, cost_price, sale_price, reorder_level)
  on public.products to authenticated;
grant update (sku, name, description, category_id, supplier_id, unit, cost_price, sale_price, reorder_level)
  on public.products to authenticated;

-- Movements: insert and read only; the ledger is never edited.
revoke insert, update, delete on public.stock_movements from authenticated;
grant select on public.stock_movements to authenticated;
grant insert (product_id, movement_type, quantity_change, note) on public.stock_movements to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.categories      enable row level security;
alter table public.suppliers       enable row level security;
alter table public.products        enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "Authenticated full access" on public.categories;
create policy "Authenticated full access" on public.categories
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated full access" on public.suppliers;
create policy "Authenticated full access" on public.suppliers
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated full access" on public.products;
create policy "Authenticated full access" on public.products
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated read" on public.stock_movements;
create policy "Authenticated read" on public.stock_movements
  for select to authenticated using (true);

drop policy if exists "Authenticated insert own" on public.stock_movements;
create policy "Authenticated insert own" on public.stock_movements
  for insert to authenticated with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: lets every open browser refresh when someone else changes stock.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['products', 'stock_movements', 'categories', 'suppliers'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
