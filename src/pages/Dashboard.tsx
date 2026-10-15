import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { useProductActions } from '../components/ProductActions';
import { MovementBadge, StatusBadge } from '../components/StatusBadge';
import { friendlyError, listMovements, movementTotalsSince } from '../lib/api';
import {
  formatCompact,
  formatDateTime,
  formatInt,
  formatMoney,
  formatMoneyCompact,
  formatRelative,
  formatSigned,
  stockStatus,
} from '../lib/format';
import { useInventory } from '../lib/inventory';
import { href } from '../lib/router';
import type { StockMovement } from '../lib/types';

export function Dashboard() {
  const { products, categories, version } = useInventory();
  const actions = useProductActions();
  const [recent, setRecent] = useState<StockMovement[] | null>(null);
  const [totals, setTotals] = useState<{ received: number; shipped: number } | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    Promise.all([listMovements({}, 0, 8), movementTotalsSince(since)])
      .then(([{ rows }, t]) => {
        if (cancelled) return;
        setRecent(rows);
        setTotals(t);
        setActivityError(null);
      })
      .catch((err) => !cancelled && setActivityError(friendlyError(err)));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const stats = useMemo(() => {
    let units = 0;
    let value = 0;
    let retail = 0;
    let low = 0;
    let out = 0;
    for (const p of products) {
      units += p.quantity;
      value += p.quantity * p.cost_price;
      retail += p.quantity * p.sale_price;
      const s = stockStatus(p);
      if (s === 'low') low++;
      if (s === 'out') out++;
    }
    return { units, value, retail, low, out };
  }, [products]);

  const byCategory = useMemo(() => {
    const rows = new Map<string, CategoryRow>();
    for (const c of categories) rows.set(c.id, { id: c.id, name: c.name, value: 0, units: 0, count: 0 });
    for (const p of products) {
      const key = p.category_id ?? 'none';
      if (!rows.has(key)) rows.set(key, { id: key, name: 'Uncategorized', value: 0, units: 0, count: 0 });
      const row = rows.get(key)!;
      row.value += p.quantity * p.cost_price;
      row.units += p.quantity;
      row.count += 1;
    }
    return [...rows.values()].filter((r) => r.count > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [products, categories]);

  const attention = useMemo(
    () =>
      products
        .filter((p) => stockStatus(p) !== 'in')
        .sort((a, b) => a.quantity / Math.max(a.reorder_level, 1) - b.quantity / Math.max(b.reorder_level, 1) || a.name.localeCompare(b.name)),
    [products],
  );

  if (products.length === 0) {
    return (
      <div className="page">
        <PageTitle />
        <div className="empty card">
          <Icon name="box" size={36} />
          <h2>No products yet</h2>
          <p className="muted">Add your first product to start tracking stock. Or run supabase/seed.sql to load sample data.</p>
          <button className="btn btn--primary" onClick={actions.create}>
            <Icon name="plus" size={16} /> Add product
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageTitle />

      <div className="tiles">
        <StatTile label="Stock value at cost" value={formatMoneyCompact(stats.value)} title={formatMoney(stats.value)} sub={`${formatMoneyCompact(stats.retail)} at sale price`} />
        <StatTile label="Units on hand" value={formatCompact(stats.units)} title={formatInt(stats.units)} sub={`across ${formatInt(products.length)} products`} />
        <StatTile
          label="Low stock"
          value={formatInt(stats.low)}
          sub="at or below reorder level"
          icon="alert"
          tone={stats.low > 0 ? 'low' : undefined}
          link={href('/products', { status: 'low' })}
        />
        <StatTile
          label="Out of stock"
          value={formatInt(stats.out)}
          sub="nothing left to ship"
          icon="stop"
          tone={stats.out > 0 ? 'out' : undefined}
          link={href('/products', { status: 'out' })}
        />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Stock value by category</h2>
              <p className="muted small">On-hand quantity × unit cost</p>
            </div>
          </div>
          <CategoryValueChart rows={byCategory} />
        </section>

        <section className="card">
          <div className="section-head">
            <div>
              <h2>Needs reordering</h2>
              <p className="muted small">{attention.length === 0 ? 'Everything is above its reorder level' : `${attention.length} product${attention.length === 1 ? '' : 's'} at or below reorder level`}</p>
            </div>
            {attention.length > 6 && <a href={href('/products', { status: 'attention' })}>View all</a>}
          </div>
          {attention.length === 0 ? (
            <div className="all-good">
              <Icon name="check" size={20} /> All stocked up.
            </div>
          ) : (
            <ul className="list">
              {attention.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <button className="list__main link-btn" onClick={() => actions.view(p)}>
                    <span className="list__title">{p.name}</span>
                    <span className="muted small">
                      {formatInt(p.quantity)} of {formatInt(p.reorder_level)} {p.unit} · <span className="mono">{p.sku}</span>
                    </span>
                  </button>
                  <StatusBadge status={stockStatus(p)} />
                  <button
                    className="btn btn--small"
                    onClick={() => actions.stock(p, 'receive', Math.max(p.reorder_level * 2 - p.quantity, 1))}
                    title="Record a delivery"
                  >
                    <Icon name="arrowIn" size={14} /> Receive
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card dash-grid__wide">
          <div className="section-head">
            <div>
              <h2>Recent activity</h2>
              {totals && (
                <p className="muted small">
                  Last 30 days: {formatInt(totals.received)} units received, {formatInt(totals.shipped)} shipped
                </p>
              )}
            </div>
            <a href={href('/movements')}>Stock history</a>
          </div>
          {activityError && <p className="error-text">{activityError}</p>}
          {!recent && !activityError && <p className="muted">Loading…</p>}
          {recent && recent.length === 0 && <p className="muted">No stock movements yet. Receive or ship a product to see it here.</p>}
          {recent && recent.length > 0 && (
            <ul className="list">
              {recent.map((m) => (
                <li key={m.id}>
                  <MovementBadge type={m.movement_type} />
                  <div className="list__main">
                    <span className="list__title">
                      {m.product?.name ?? 'Deleted product'} <span className="timeline__change">{formatSigned(m.quantity_change)}</span>
                    </span>
                    <span className="muted small">{[m.note, m.created_by_email].filter(Boolean).join(' · ')}</span>
                  </div>
                  <span className="muted small nowrap" title={formatDateTime(m.created_at)}>
                    {formatRelative(m.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PageTitle() {
  return (
    <header className="page-head">
      <div>
        <h1>Dashboard</h1>
        <p className="muted">Where your stock stands right now.</p>
      </div>
    </header>
  );
}

function StatTile({
  label,
  value,
  sub,
  title,
  icon,
  tone,
  link,
}: {
  label: string;
  value: string;
  sub: string;
  title?: string;
  icon?: IconName;
  tone?: 'low' | 'out';
  link?: string;
}) {
  const body = (
    <>
      <span className="tile__label">
        {icon && <Icon name={icon} size={16} className={tone ? `tone-${tone}` : 'muted'} />}
        {label}
      </span>
      <span className="tile__value" title={title}>
        {value}
      </span>
      <span className="tile__sub">{sub}</span>
    </>
  );
  return link ? (
    <a className="tile card tile--link" href={link}>
      {body}
    </a>
  ) : (
    <div className="tile card">{body}</div>
  );
}

interface CategoryRow {
  id: string;
  name: string;
  value: number;
  units: number;
  count: number;
}

/** Single-series horizontal bars: one hue, value at the tip, tooltip on hover/focus, click to filter. */
function CategoryValueChart({ rows }: { rows: CategoryRow[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 0);

  if (rows.length === 0) return <p className="muted">No categories yet.</p>;

  return (
    <div className="hbar" role="list" onMouseLeave={() => setActive(null)}>
      {rows.map((r) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        return (
          <a
            key={r.id}
            role="listitem"
            className={`hbar__row${active === r.id ? ' is-active' : ''}`}
            href={href('/products', { category: r.id })}
            onMouseEnter={() => setActive(r.id)}
            onFocus={() => setActive(r.id)}
            onBlur={() => setActive(null)}
            aria-label={`${r.name}: ${formatMoney(r.value)}, ${formatInt(r.units)} units in ${r.count} products`}
          >
            <span className="hbar__label" title={r.name}>
              {r.name}
            </span>
            <span className="hbar__track">
              <span className="hbar__bar" style={{ width: `${pct}%` }} />
              <span className="hbar__value">{formatMoneyCompact(r.value)}</span>
              {active === r.id && (
                <span className="tooltip" style={{ left: `min(${pct}%, calc(100% - 180px))` }} role="tooltip">
                  <strong>{r.name}</strong>
                  <span>{formatMoney(r.value)}</span>
                  <span className="muted">
                    {formatInt(r.units)} units · {r.count} product{r.count === 1 ? '' : 's'}
                  </span>
                </span>
              )}
            </span>
          </a>
        );
      })}
    </div>
  );
}
