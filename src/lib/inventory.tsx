import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listCategories, listProducts, listSuppliers } from './api';
import { db } from './supabase';
import type { Category, Product, Supplier } from './types';

interface InventoryContextValue {
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
  productsById: Map<string, Product>;
  categoriesById: Map<string, Category>;
  suppliersById: Map<string, Supplier>;
  loading: boolean;
  error: unknown;
  /** Increments whenever data changes (here or in another window signed in to the same account). Views that fetch their own data depend on it. */
  version: number;
  refresh: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const [p, c, s] = await Promise.all([listProducts(), listCategories(), listSuppliers()]);
      if (ticket !== latest.current) return; // a newer refresh superseded this one
      setProducts(p);
      setCategories(c);
      setSuppliers(s);
      setError(null);
      setVersion((v) => v + 1);
    } catch (err) {
      if (ticket === latest.current) setError(err);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live updates: when this account's inventory changes anywhere, refetch (debounced so a burst of changes costs one fetch).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 400);
    };
    const channel = db().channel('inventory-changes');
    for (const table of ['products', 'stock_movements', 'categories', 'suppliers']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    }
    channel.subscribe();
    const onFocus = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onFocus);
      void db().removeChannel(channel);
    };
  }, [refresh]);

  const value = useMemo<InventoryContextValue>(
    () => ({
      products,
      categories,
      suppliers,
      productsById: new Map(products.map((p) => [p.id, p])),
      categoriesById: new Map(categories.map((c) => [c.id, c])),
      suppliersById: new Map(suppliers.map((s) => [s.id, s])),
      loading,
      error,
      version,
      refresh,
    }),
    [products, categories, suppliers, loading, error, version, refresh],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used inside <InventoryProvider>');
  return ctx;
}
