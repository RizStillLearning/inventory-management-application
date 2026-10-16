-- Optional sample data. Run after schema.sql if you want something to click around in.
-- It goes into one account's inventory: sign up in the app first, and change owner_email
-- below to that account's email. Re-running is harmless: rows that already exist in that
-- inventory (by name / SKU) are skipped.
--
-- Everything is one block, so it runs the same in the Supabase SQL editor and in psql.

do $$
declare
  owner_email constant text := 'harrisk2606@gmail.com';
  seed_owner uuid;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'categories' and column_name = 'owner_id'
  ) then
    raise exception 'Run the current supabase/schema.sql first, then run this file again.';
  end if;

  select id into seed_owner from auth.users where email = owner_email;
  if seed_owner is null then
    raise exception 'No account uses %. Sign up in the app with it first, or change owner_email at the top of seed.sql.', owner_email;
  end if;

  insert into public.categories (owner_id, name, description)
  select seed_owner, c.name, c.description
    from (values
      ('Electronics', 'Devices, cables and accessories'),
      ('Office Supplies', 'Paper, pens and desk essentials'),
      ('Furniture', 'Desks, chairs and storage'),
      ('Cleaning', 'Janitorial and sanitation products')
    ) as c (name, description)
  on conflict (owner_id, name) do nothing;

  insert into public.suppliers (owner_id, name, contact_name, email, phone)
  select seed_owner, s.name, s.contact_name, s.email, s.phone
    from (values
      ('Acme Distribution', 'Dana Ruiz', 'orders@acme.example', '+1 555 0100'),
      ('Northwind Traders', 'Sam Okafor', 'sales@northwind.example', '+1 555 0142'),
      ('Globex Wholesale', 'Priya Natarajan', 'supply@globex.example', '+1 555 0177')
    ) as s (name, contact_name, email, phone)
  on conflict (owner_id, name) do nothing;

  insert into public.products (owner_id, sku, name, category_id, supplier_id, unit, cost_price, sale_price, reorder_level)
  select seed_owner, p.sku, p.name, c.id, s.id, p.unit, p.cost_price, p.sale_price, p.reorder_level
    from (values
      ('EL-1001', 'USB-C Charging Cable 2m', 'Electronics',     'Acme Distribution', 'pcs',  3.20,   9.99, 40),
      ('EL-1002', 'Wireless Mouse',          'Electronics',     'Acme Distribution', 'pcs',  8.50,  24.99, 15),
      ('EL-1003', '27" Monitor',             'Electronics',     'Globex Wholesale',  'pcs', 145.00, 229.00, 5),
      ('EL-1004', 'Mechanical Keyboard',     'Electronics',     'Globex Wholesale',  'pcs', 42.00,  89.00, 10),
      ('OF-2001', 'A4 Copy Paper (500)',     'Office Supplies', 'Northwind Traders', 'ream', 3.10,   6.50, 50),
      ('OF-2002', 'Ballpoint Pens (box 50)', 'Office Supplies', 'Northwind Traders', 'box',  6.00,  14.00, 10),
      ('OF-2003', 'Sticky Notes 3x3',        'Office Supplies', 'Northwind Traders', 'pack', 1.40,   3.99, 30),
      ('FU-3001', 'Ergonomic Office Chair',  'Furniture',       'Globex Wholesale',  'pcs', 120.00, 249.00, 3),
      ('FU-3002', 'Standing Desk Frame',     'Furniture',       'Globex Wholesale',  'pcs', 180.00, 379.00, 2),
      ('CL-4001', 'Disinfectant Spray 750ml','Cleaning',        'Acme Distribution', 'bottle', 2.30, 5.49, 25),
      ('CL-4002', 'Microfiber Cloths (10)',  'Cleaning',        'Acme Distribution', 'pack', 4.10,   9.99, 12)
    ) as p (sku, name, category, supplier, unit, cost_price, sale_price, reorder_level)
    join public.categories c on c.owner_id = seed_owner and c.name = p.category
    join public.suppliers  s on s.owner_id = seed_owner and s.name = p.supplier
  on conflict do nothing;

  -- Opening stock and some history, only for products that have no movements yet.
  insert into public.stock_movements (owner_id, product_id, movement_type, quantity_change, note, created_at)
  select seed_owner, pr.id, m.movement_type, m.quantity_change, m.note, now() - make_interval(days => m.days_ago)
    from (values
      ('EL-1001', 'receive', 200, 'Opening stock', 35),
      ('EL-1001', 'ship',    -45, 'Order #1042',   12),
      ('EL-1001', 'ship',   -130, 'Order #1077',    2),
      ('EL-1002', 'receive',  60, 'Opening stock', 35),
      ('EL-1002', 'ship',    -18, 'Order #1051',    9),
      ('EL-1003', 'receive',  12, 'Opening stock', 35),
      ('EL-1003', 'ship',    -12, 'Order #1066',    4),
      ('EL-1004', 'receive',  25, 'Opening stock', 35),
      ('OF-2001', 'receive', 300, 'Opening stock', 35),
      ('OF-2001', 'ship',    -80, 'Order #1049',   10),
      ('OF-2002', 'receive',  40, 'Opening stock', 35),
      ('OF-2003', 'receive',  90, 'Opening stock', 35),
      ('OF-2003', 'adjust',   -4, 'Damaged in storage', 6),
      ('FU-3001', 'receive',   8, 'Opening stock', 35),
      ('FU-3001', 'ship',     -6, 'Order #1058',    5),
      ('FU-3002', 'receive',   6, 'Opening stock', 35),
      ('CL-4001', 'receive',  80, 'Opening stock', 35),
      ('CL-4001', 'ship',    -61, 'Order #1070',    3),
      ('CL-4002', 'receive',  30, 'Opening stock', 35)
    ) as m (sku, movement_type, quantity_change, note, days_ago)
    join public.products pr on pr.owner_id = seed_owner and pr.sku = m.sku
   where not exists (select 1 from public.stock_movements sm where sm.product_id = pr.id)
   order by m.days_ago desc;
end;
$$;
