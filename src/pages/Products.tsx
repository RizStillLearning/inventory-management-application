import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { useProductActions } from '../components/ProductActions';
import { StatusBadge } from '../components/StatusBadge';
import { downloadCsv, formatInt, formatMoney, statusLabel, stockStatus } from '../lib/format';
import { useInventory } from '../lib/inventory';
import { navigate, type Route } from '../lib/router';
import type { Product, StockStatus } from '../lib/types';

type SortKey = 'name' | 'sku' | 'category' | 'quantity' | 'value' | 'price' | 'status';
type StatusFilter = '' | StockStatus | 'attention';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'in', label: 'In stock' },
  { value: 'attention', label: 'Needs reorder' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out' },
];

const statusRank: Record<StockStatus, number> = { out: 0, low: 1, in: 2 };

export function Products({ route }: { route: Route }) {
  const { products, categories, suppliers, categoriesById, suppliersById } = useInventory();
  const actions = useProductActions();

  const q = route.params.get('q') ?? '';
  const category = route.params.get('category') ?? '';
  const supplier = route.params.get('supplier') ?? '';
  const status = (route.params.get('status') ?? '') as StatusFilter;
  const sort = (route.params.get('sort') ?? 'name') as SortKey;
  const dir = route.params.get('dir') === 'desc' ? 'desc' : 'asc';

  const setParam = (changes: Record<string, string>) => {
    const next: Record<string, string> = { q, category, supplier, status, sort, dir, ...changes };
    if (next.sort === 'name') next.sort = '';
    if (next.dir === 'asc') next.dir = '';
    navigate('/products', next, true);
  };

  const categoryName = (p: Product) => (p.category_id ? categoriesById.get(p.category_id)?.name ?? '' : '');
  const supplierName = (p: Product) => (p.supplier_id ? suppliersById.get(p.supplier_id)?.name ?? '' : '');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (needle && !`${p.name} ${p.sku} ${p.description ?? ''}`.toLowerCase().includes(needle)) return false;
      if (category === 'none' ? p.category_id !== null : category && p.category_id !== category) return false;
      if (supplier === 'none' ? p.supplier_id !== null : supplier && p.supplier_id !== supplier) return false;
      const s = stockStatus(p);
      if (status === 'attention' ? s === 'in' : status && s !== status) return false;
      return true;
    });
    const key: Record<SortKey, (p: Product) => string | number> = {
      name: (p) => p.name.toLowerCase(),
      sku: (p) => p.sku.toLowerCase(),
      category: (p) => categoryName(p).toLowerCase() || '￿',
      quantity: (p) => p.quantity,
      value: (p) => p.quantity * p.cost_price,
      price: (p) => p.sale_price,
      status: (p) => statusRank[stockStatus(p)],
    };
    const get = key[sort] ?? key.name;
    const sign = dir === 'desc' ? -1 : 1;
    return filtered.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return cmp * sign || a.name.localeCompare(b.name);
    });
  }, [products, categoriesById, q, category, supplier, status, sort, dir]);

  const filtersActive = Boolean(q || category || supplier || status);

  function exportCsv() {
    downloadCsv(
      `products-${new Date().toISOString().slice(0, 10)}.csv`,
      ['SKU', 'Name', 'Category', 'Supplier', 'Unit', 'On hand', 'Reorder level', 'Unit cost', 'Sale price', 'Stock value', 'Status', 'Description'],
      rows.map((p) => [
        p.sku,
        p.name,
        categoryName(p),
        supplierName(p),
        p.unit,
        p.quantity,
        p.reorder_level,
        p.cost_price.toFixed(2),
        p.sale_price.toFixed(2),
        (p.quantity * p.cost_price).toFixed(2),
        statusLabel[stockStatus(p)],
        p.description,
      ]),
    );
  }

  const SortHeader = ({ k, label, numeric }: { k: SortKey; label: string; numeric?: boolean }) => {
    const activeSort = sort === k;
    return (
      <th className={numeric ? 'num' : undefined} aria-sort={activeSort ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={`sort-btn${activeSort ? ' is-active' : ''}`}
          onClick={() => setParam({ sort: k, dir: activeSort && dir === 'asc' ? 'desc' : activeSort ? 'asc' : numeric ? 'desc' : 'asc' })}
        >
          {label}
          <Icon name={activeSort ? (dir === 'asc' ? 'sortUp' : 'sortDown') : 'sort'} size={14} />
        </button>
      </th>
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Products</h1>
          <p className="muted">
            {filtersActive ? `${formatInt(rows.length)} of ${formatInt(products.length)} products` : `${formatInt(products.length)} products`}
          </p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>
            <Icon name="download" size={16} /> Export CSV
          </button>
          <button className="btn btn--primary" onClick={actions.create}>
            <Icon name="plus" size={16} /> New product
          </button>
        </div>
      </header>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search name, SKU or description"
            value={q}
            onChange={(e) => setParam({ q: e.target.value })}
            aria-label="Search products"
          />
        </label>
        <select value={category} onChange={(e) => setParam({ category: e.target.value })} aria-label="Filter by category">
          <option value="">All categories</option>
          <option value="none">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={supplier} onChange={(e) => setParam({ supplier: e.target.value })} aria-label="Filter by supplier">
          <option value="">All suppliers</option>
          <option value="none">No supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="segmented segmented--compact" role="radiogroup" aria-label="Filter by stock status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              role="radio"
              aria-checked={status === f.value}
              className={status === f.value ? 'is-active' : ''}
              onClick={() => setParam({ status: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filtersActive && (
          <button className="btn btn--text" onClick={() => navigate('/products', { sort: sort === 'name' ? '' : sort, dir: dir === 'asc' ? '' : dir }, true)}>
            Clear filters
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <div className="empty card">
          <Icon name="box" size={36} />
          <h2>No products yet</h2>
          <p className="muted">Products you add appear here with their live stock levels.</p>
          <button className="btn btn--primary" onClick={actions.create}>
            <Icon name="plus" size={16} /> Add product
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty card">
          <Icon name="search" size={32} />
          <h2>No matching products</h2>
          <p className="muted">Try a different search or clear the filters.</p>
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="table table--interactive table--cards">
            <thead>
              <tr>
                <SortHeader k="name" label="Product" />
                <SortHeader k="category" label="Category" />
                <SortHeader k="quantity" label="On hand" numeric />
                <th className="num">Reorder at</th>
                <SortHeader k="price" label="Price" numeric />
                <SortHeader k="value" label="Stock value" numeric />
                <SortHeader k="status" label="Status" />
                <th className="actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => actions.view(p)}>
                  <td className="c-product">
                    <button className="link-btn cell-title" onClick={(e) => (e.stopPropagation(), actions.view(p))}>
                      {p.name}
                    </button>
                    <div className="muted small mono">
                      {p.sku}
                      {supplierName(p) && <span className="sans"> · {supplierName(p)}</span>}
                    </div>
                  </td>
                  <td className="hide-sm">{categoryName(p) || <span className="muted">—</span>}</td>
                  <td className="num c-qty">
                    <strong>{formatInt(p.quantity)}</strong> <span className="muted small">{p.unit}</span>
                    <span className="show-sm muted small"> · reorder at {formatInt(p.reorder_level)}</span>
                  </td>
                  <td className="num muted hide-sm">{formatInt(p.reorder_level)}</td>
                  <td className="num hide-sm">{formatMoney(p.sale_price)}</td>
                  <td className="num hide-sm">{formatMoney(p.quantity * p.cost_price)}</td>
                  <td className="c-status">
                    <StatusBadge status={stockStatus(p)} />
                  </td>
                  <td className="actions-col c-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="btn btn--small" onClick={() => actions.stock(p, 'receive')} title="Receive, ship or count stock">
                        <Icon name="adjust" size={14} /> Stock
                      </button>
                      <button className="icon-btn" onClick={() => actions.edit(p)} aria-label={`Edit ${p.name}`} title="Edit">
                        <Icon name="edit" size={16} />
                      </button>
                      <button className="icon-btn icon-btn--danger" onClick={() => void actions.remove(p)} aria-label={`Delete ${p.name}`} title="Delete">
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
