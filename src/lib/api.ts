import type { PostgrestError } from '@supabase/supabase-js';
import { db } from './supabase';
import type {
  Category,
  CategoryInput,
  MovementInput,
  MovementType,
  Product,
  ProductInput,
  StockMovement,
  Supplier,
  SupplierInput,
} from './types';

const PAGE_SIZE = 1000; // PostgREST's default max rows per request

function check<T>(data: T | null, error: PostgrestError | null): T {
  if (error) throw error;
  return data as T;
}

/** Reads every row of a table, paging past the per-request row limit. */
async function fetchAll<T>(table: string, orderBy: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db()
      .from(table)
      .select('*')
      .order(orderBy)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    const page = check(data, error) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

const toNumber = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

function normalizeProduct(p: Product): Product {
  return {
    ...p,
    cost_price: toNumber(p.cost_price),
    sale_price: toNumber(p.sale_price),
    quantity: toNumber(p.quantity),
    reorder_level: toNumber(p.reorder_level),
  };
}

// --- Products --------------------------------------------------------------

export async function listProducts(): Promise<Product[]> {
  return (await fetchAll<Product>('products', 'name')).map(normalizeProduct);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data, error } = await db().from('products').insert(input).select().single();
  return normalizeProduct(check(data, error) as Product);
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { error } = await db().from('products').update(input).eq('id', id);
  check(null, error);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await db().from('products').delete().eq('id', id);
  check(null, error);
}

// --- Categories ------------------------------------------------------------

export function listCategories(): Promise<Category[]> {
  return fetchAll<Category>('categories', 'name');
}

export async function saveCategory(id: string | null, input: CategoryInput): Promise<void> {
  const query = id ? db().from('categories').update(input).eq('id', id) : db().from('categories').insert(input);
  const { error } = await query;
  check(null, error);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await db().from('categories').delete().eq('id', id);
  check(null, error);
}

// --- Suppliers -------------------------------------------------------------

export function listSuppliers(): Promise<Supplier[]> {
  return fetchAll<Supplier>('suppliers', 'name');
}

export async function saveSupplier(id: string | null, input: SupplierInput): Promise<void> {
  const query = id ? db().from('suppliers').update(input).eq('id', id) : db().from('suppliers').insert(input);
  const { error } = await query;
  check(null, error);
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await db().from('suppliers').delete().eq('id', id);
  check(null, error);
}

// --- Stock movements -------------------------------------------------------

export async function recordMovement(input: MovementInput): Promise<StockMovement> {
  const { data, error } = await db().from('stock_movements').insert(input).select().single();
  return check(data, error) as StockMovement;
}

export interface MovementFilters {
  productId?: string;
  type?: MovementType | '';
  from?: string; // yyyy-mm-dd, inclusive
  to?: string; // yyyy-mm-dd, inclusive
}

export async function listMovements(
  filters: MovementFilters,
  offset: number,
  limit: number,
): Promise<{ rows: StockMovement[]; total: number }> {
  let query = db()
    .from('stock_movements')
    .select('*, product:products(id, name, sku, unit)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.productId) query = query.eq('product_id', filters.productId);
  if (filters.type) query = query.eq('movement_type', filters.type);
  if (filters.from) query = query.gte('created_at', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query = query.lt('created_at', end.toISOString());
  }

  const { data, error, count } = await query;
  return { rows: check(data, error) as StockMovement[], total: count ?? 0 };
}

/** Totals received and shipped since a date, for the dashboard. */
export async function movementTotalsSince(since: Date): Promise<{ received: number; shipped: number }> {
  let received = 0;
  let shipped = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db()
      .from('stock_movements')
      .select('movement_type, quantity_change')
      .gte('created_at', since.toISOString())
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    const page = check(data, error) as Pick<StockMovement, 'movement_type' | 'quantity_change'>[];
    for (const m of page) {
      if (m.movement_type === 'receive') received += m.quantity_change;
      if (m.movement_type === 'ship') shipped -= m.quantity_change;
    }
    if (page.length < PAGE_SIZE) return { received, shipped };
  }
}

// --- Errors ----------------------------------------------------------------

interface ErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

/** True when the database tables have not been created yet. */
export function isSchemaMissing(err: unknown): boolean {
  const e = err as ErrorLike;
  return e?.code === 'PGRST205' || e?.code === '42P01' || /schema cache/i.test(e?.message ?? '');
}

/** Turns Supabase/Postgres errors into a sentence a user can act on. */
export function friendlyError(err: unknown): string {
  const e = err as ErrorLike;
  const text = `${e?.message ?? ''} ${e?.details ?? ''}`;
  switch (e?.code) {
    case '23505':
      if (/sku/i.test(text)) return 'Another product already uses that SKU.';
      if (/name/i.test(text)) return 'That name is already taken.';
      return 'That record already exists.';
    case '23514':
      if (/stock/i.test(text)) return e.message ?? 'Not enough stock.';
      return 'One of the values is out of range.';
    case '23503':
      return 'This record is still referenced by other data.';
    case '42501':
      return 'You do not have permission to do that. Are you signed in?';
    case 'PGRST301':
    case 'PGRST303':
      return 'Your session has expired. Please sign in again.';
  }
  if (isSchemaMissing(err)) return 'The database tables are missing. Run supabase/schema.sql in the Supabase SQL editor.';
  if (/failed to fetch|network/i.test(text)) return 'Could not reach Supabase. Check your connection and project URL.';
  return e?.message || 'Something went wrong.';
}
