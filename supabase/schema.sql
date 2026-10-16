-- Inventory management schema for Supabase.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: objects are created with IF NOT EXISTS / OR REPLACE where possible.
--
-- Every account has its own inventory. Each row carries an owner_id, filled in from the
-- signed-in user, and row level security only lets an account see and change its own rows.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  description text,
  created_at  timestamptz not null default now(),
  unique (owner_id, name),
  unique (id, owner_id) -- lets products reference it only from the same inventory
);

create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  contact_name text,
  email        text,
  phone        text,
  created_at   timestamptz not null default now(),
  unique (owner_id, name),
  unique (id, owner_id)
);

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sku           text not null check (length(trim(sku)) > 0),
  name          text not null check (length(trim(name)) > 0),
  description   text,
  category_id   uuid,
  supplier_id   uuid,
  unit          text not null default 'pcs',
  cost_price    numeric(12, 2) not null default 0 check (cost_price >= 0),
  sale_price    numeric(12, 2) not null default 0 check (sale_price >= 0),
  -- quantity is maintained by the stock_movements trigger; clients cannot write it.
  quantity      integer not null default 0 check (quantity >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, sku),
  unique (id, owner_id),
  -- The category and supplier must be in the same inventory as the product.
  foreign key (category_id, owner_id) references public.categories (id, owner_id) on delete set null (category_id),
  foreign key (supplier_id, owner_id) references public.suppliers (id, owner_id) on delete set null (supplier_id)
);

-- Append-only ledger. Every change to products.quantity is a row here.
create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id      uuid not null,
  movement_type   text not null check (movement_type in ('receive', 'ship', 'adjust')),
  quantity_change integer not null check (quantity_change <> 0),
  quantity_after  integer,
  note            text,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at      timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade,
  constraint movement_sign check (
    (movement_type = 'receive' and quantity_change > 0) or
    (movement_type = 'ship'    and quantity_change < 0) or
    (movement_type = 'adjust')
  )
);

-- ---------------------------------------------------------------------------
-- Upgrade: databases created before each account had its own inventory
-- ---------------------------------------------------------------------------
-- Those tables have no owner_id yet. Their existing rows become the admin account's
-- inventory, and new accounts start empty. Runs once; afterwards it does nothing.

do $$
declare
  admin_email constant text := 'harrisk2606@gmail.com';
  admin_id uuid;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'categories' and column_name = 'owner_id'
  ) then
    return;
  end if;

  select id into admin_id from auth.users where email = admin_email;
  if admin_id is null and (
    exists (select 1 from public.categories) or
    exists (select 1 from public.suppliers) or
    exists (select 1 from public.products)
  ) then
    raise exception 'The existing inventory belongs to %, but that account does not exist yet. Sign up in the app with it, then run this script again.', admin_email;
  end if;

  alter table public.categories drop constraint if exists categories_name_key;
  alter table public.categories add column owner_id uuid references auth.users (id) on delete cascade;
  update public.categories set owner_id = admin_id;
  alter table public.categories
    alter column owner_id set not null,
    alter column owner_id set default auth.uid(),
    add unique (owner_id, name),
    add unique (id, owner_id);

  alter table public.suppliers drop constraint if exists suppliers_name_key;
  alter table public.suppliers add column owner_id uuid references auth.users (id) on delete cascade;
  update public.suppliers set owner_id = admin_id;
  alter table public.suppliers
    alter column owner_id set not null,
    alter column owner_id set default auth.uid(),
    add unique (owner_id, name),
    add unique (id, owner_id);

  alter table public.products
    drop constraint if exists products_sku_key,
    drop constraint if exists products_category_id_fkey,
    drop constraint if exists products_supplier_id_fkey;
  alter table public.products add column owner_id uuid references auth.users (id) on delete cascade;
  update public.products set owner_id = admin_id;
  alter table public.products
    alter column owner_id set not null,
    alter column owner_id set default auth.uid(),
    add unique (owner_id, sku),
    add unique (id, owner_id),
    add foreign key (category_id, owner_id) references public.categories (id, owner_id) on delete set null (category_id),
    add foreign key (supplier_id, owner_id) references public.suppliers (id, owner_id) on delete set null (supplier_id);

  alter table public.stock_movements drop constraint if exists stock_movements_product_id_fkey;
  alter table public.stock_movements add column owner_id uuid references auth.users (id) on delete cascade;
  update public.stock_movements set owner_id = admin_id;
  alter table public.stock_movements
    alter column owner_id set not null,
    alter column owner_id set default auth.uid(),
    add foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_supplier_idx on public.products (supplier_id);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
drop index if exists public.stock_movements_created_idx;
create index if not exists stock_movements_owner_created_idx on public.stock_movements (owner_id, created_at desc);

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
-- products.quantity, which the authenticated role is not granted. It only touches a
-- product in the movement's own inventory.
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
   where id = new.product_id and owner_id = new.owner_id
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
-- Signed-in users each get their own inventory. Anonymous visitors get nothing.
-- owner_id is never writable: it always comes from the signed-in user.

revoke all on public.categories, public.suppliers, public.products, public.stock_movements from anon;

revoke insert, update on public.categories, public.suppliers, public.products from authenticated;
grant select, delete on public.categories, public.suppliers, public.products to authenticated;
grant insert (name, description), update (name, description) on public.categories to authenticated;
grant insert (name, contact_name, email, phone), update (name, contact_name, email, phone)
  on public.suppliers to authenticated;
-- Products: every column except owner_id and quantity (and server-managed timestamps) is writable.
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
drop policy if exists "Owner full access" on public.categories;
create policy "Owner full access" on public.categories
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Authenticated full access" on public.suppliers;
drop policy if exists "Owner full access" on public.suppliers;
create policy "Owner full access" on public.suppliers
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Authenticated full access" on public.products;
drop policy if exists "Owner full access" on public.products;
create policy "Owner full access" on public.products
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Authenticated read" on public.stock_movements;
drop policy if exists "Owner read" on public.stock_movements;
create policy "Owner read" on public.stock_movements
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Authenticated insert own" on public.stock_movements;
drop policy if exists "Owner insert" on public.stock_movements;
create policy "Owner insert" on public.stock_movements
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and created_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime: lets every open window of the same account refresh when stock changes.
-- Row level security applies, so an account only hears about its own rows.
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
