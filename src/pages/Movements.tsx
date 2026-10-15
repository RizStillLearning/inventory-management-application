import { useEffect, useRef, useState } from 'react';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { useProductActions } from '../components/ProductActions';
import { MovementBadge } from '../components/StatusBadge';
import { friendlyError, listMovements, type MovementFilters } from '../lib/api';
import { downloadCsv, formatDateTime, formatInt, formatSigned } from '../lib/format';
import { useInventory } from '../lib/inventory';
import { navigate, type Route } from '../lib/router';
import type { MovementType, StockMovement } from '../lib/types';

const PAGE = 50;

export function Movements({ route }: { route: Route }) {
  const { products, productsById, version } = useInventory();
  const actions = useProductActions();
  const { toast } = useFeedback();

  const filters: MovementFilters = {
    productId: route.params.get('product') ?? '',
    type: (route.params.get('type') ?? '') as MovementType | '',
    from: route.params.get('from') ?? '',
    to: route.params.get('to') ?? '',
  };
  const filterKey = JSON.stringify(filters);

  const [rows, setRows] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const setFilter = (changes: Partial<Record<'product' | 'type' | 'from' | 'to', string>>) =>
    navigate('/movements', { product: filters.productId, type: filters.type, from: filters.from, to: filters.to, ...changes }, true);

  // How many rows the list should hold. Resets when filters change; grows with "Load more" so
  // live refreshes keep everything that is already on screen.
  const limit = useRef(PAGE);
  const lastFilterKey = useRef(filterKey);

  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      limit.current = PAGE;
      setRows([]);
    }
    let cancelled = false;
    setLoading(true);
    listMovements(JSON.parse(filterKey) as MovementFilters, 0, limit.current)
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => !cancelled && setError(friendlyError(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filterKey, version]);

  async function loadMore() {
    setLoading(true);
    try {
      const res = await listMovements(filters, rows.length, PAGE);
      setRows((r) => [...r, ...res.rows]);
      setTotal(res.total);
      limit.current = rows.length + res.rows.length;
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const all: StockMovement[] = [];
      while (all.length < total) {
        const res = await listMovements(filters, all.length, 1000);
        all.push(...res.rows);
        if (res.rows.length === 0) break;
      }
      downloadCsv(
        `stock-history-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Date', 'SKU', 'Product', 'Type', 'Change', 'Balance after', 'Note', 'By'],
        all.map((m) => [
          new Date(m.created_at).toISOString(),
          m.product?.sku ?? '',
          m.product?.name ?? '',
          m.movement_type,
          m.quantity_change,
          m.quantity_after,
          m.note,
          m.created_by_email,
        ]),
      );
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setExporting(false);
    }
  }

  const filtersActive = Boolean(filters.productId || filters.type || filters.from || filters.to);
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Stock history</h1>
          <p className="muted">Every receipt, shipment and count, newest first. Entries cannot be edited or deleted.</p>
        </div>
        <button className="btn" onClick={exportCsv} disabled={total === 0 || exporting}>
          <Icon name="download" size={16} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </header>

      <div className="toolbar">
        <select value={filters.productId} onChange={(e) => setFilter({ product: e.target.value })} aria-label="Filter by product">
          <option value="">All products</option>
          {sortedProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </select>
        <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="receive">Received</option>
          <option value="ship">Shipped</option>
          <option value="adjust">Adjusted</option>
        </select>
        <label className="inline-field">
          <span className="muted small">From</span>
          <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} />
        </label>
        <label className="inline-field">
          <span className="muted small">To</span>
          <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} />
        </label>
        {filtersActive && (
          <button className="btn btn--text" onClick={() => navigate('/movements', {}, true)}>
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      {!loading && !error && rows.length === 0 ? (
        <div className="empty card">
          <Icon name="history" size={32} />
          <h2>{filtersActive ? 'No matching movements' : 'No stock movements yet'}</h2>
          <p className="muted">{filtersActive ? 'Try widening the date range or clearing filters.' : 'Receive, ship or count a product and it will be logged here.'}</p>
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Type</th>
                <th className="num">Change</th>
                <th className="num">Balance</th>
                <th>Note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const product = productsById.get(m.product_id);
                return (
                  <tr key={m.id}>
                    <td className="nowrap">{formatDateTime(m.created_at)}</td>
                    <td>
                      {product ? (
                        <button className="link-btn cell-title" onClick={() => actions.view(product)}>
                          {m.product?.name ?? product.name}
                        </button>
                      ) : (
                        <span>{m.product?.name ?? 'Deleted product'}</span>
                      )}
                      <div className="muted small mono">{m.product?.sku}</div>
                    </td>
                    <td>
                      <MovementBadge type={m.movement_type} />
                    </td>
                    <td className={`num change change--${m.quantity_change > 0 ? 'up' : 'down'}`}>{formatSigned(m.quantity_change)}</td>
                    <td className="num">{m.quantity_after === null ? '—' : formatInt(m.quantity_after)}</td>
                    <td className="note-cell">{m.note || <span className="muted">—</span>}</td>
                    <td className="muted small">{m.created_by_email ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="table-foot">
            <span className="muted small">
              Showing {formatInt(rows.length)} of {formatInt(total)}
            </span>
            {rows.length < total && (
              <button className="btn btn--small" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            )}
            {loading && rows.length === 0 && <span className="muted small">Loading…</span>}
          </div>
        </div>
      )}
    </div>
  );
}
