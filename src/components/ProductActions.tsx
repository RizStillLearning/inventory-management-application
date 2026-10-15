import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { deleteProduct, friendlyError, listMovements } from '../lib/api';
import { formatDateTime, formatInt, formatMoney, formatRelative, formatSigned, stockStatus } from '../lib/format';
import { useInventory } from '../lib/inventory';
import { href } from '../lib/router';
import type { MovementType, Product, StockMovement } from '../lib/types';
import { useFeedback } from './Feedback';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { ProductFormModal } from './ProductForm';
import { MovementBadge, StatusBadge } from './StatusBadge';
import { StockModal } from './StockForm';

interface ProductActions {
  create: () => void;
  edit: (p: Product) => void;
  stock: (p: Product, type?: MovementType, suggestedQuantity?: number) => void;
  view: (p: Product) => void;
  remove: (p: Product) => Promise<void>;
}

const ProductActionsContext = createContext<ProductActions | null>(null);

interface StockRequest {
  product: Product;
  type: MovementType;
  suggestedQuantity?: number;
}

export function ProductActionsProvider({ children }: { children: ReactNode }) {
  const { refresh } = useInventory();
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [stockReq, setStockReq] = useState<StockRequest | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const remove = useCallback(
    async (p: Product) => {
      const ok = await confirm({
        title: 'Delete product?',
        message: (
          <>
            <p>
              <strong>{p.name}</strong> ({p.sku}) and its entire stock history will be permanently deleted.
            </p>
            {p.quantity > 0 && (
              <p className="muted">
                It still has {formatInt(p.quantity)} {p.unit} on hand. To keep the history, ship or count it to zero instead.
              </p>
            )}
          </>
        ),
        confirmLabel: 'Delete product',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteProduct(p.id);
        setViewing((id) => (id === p.id ? null : id));
        toast(`Deleted ${p.name}`);
        await refresh();
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    },
    [confirm, refresh, toast],
  );

  const actions = useMemo<ProductActions>(
    () => ({
      create: () => setForm({ open: true, product: null }),
      edit: (p) => setForm({ open: true, product: p }),
      stock: (p, type = 'receive', suggestedQuantity) => setStockReq({ product: p, type, suggestedQuantity }),
      view: (p) => setViewing(p.id),
      remove,
    }),
    [remove],
  );

  return (
    <ProductActionsContext.Provider value={actions}>
      {children}
      <ProductDrawer productId={viewing} onClose={() => setViewing(null)} actions={actions} />
      <ProductFormModal open={form.open} product={form.product} onClose={() => setForm((f) => ({ ...f, open: false }))} />
      <StockModal
        product={stockReq?.product ?? null}
        initialType={stockReq?.type}
        suggestedQuantity={stockReq?.suggestedQuantity}
        onClose={() => setStockReq(null)}
      />
    </ProductActionsContext.Provider>
  );
}

export function useProductActions(): ProductActions {
  const ctx = useContext(ProductActionsContext);
  if (!ctx) throw new Error('useProductActions must be used inside <ProductActionsProvider>');
  return ctx;
}

// --- Detail drawer ---------------------------------------------------------

function ProductDrawer({ productId, onClose, actions }: { productId: string | null; onClose: () => void; actions: ProductActions }) {
  const { productsById, categoriesById, suppliersById, version } = useInventory();
  const product = productId ? productsById.get(productId) : undefined;
  const [history, setHistory] = useState<StockMovement[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    listMovements({ productId }, 0, 20)
      .then(({ rows, total }) => {
        if (cancelled) return;
        setHistory(rows);
        setHistoryTotal(total);
        setHistoryError(null);
      })
      .catch((err) => !cancelled && setHistoryError(friendlyError(err)));
    return () => {
      cancelled = true;
    };
  }, [productId, version]);

  useEffect(() => {
    if (!productId) setHistory(null);
  }, [productId]);

  // The product was deleted elsewhere while open.
  useEffect(() => {
    if (productId && !product && productsById.size > 0) onClose();
  }, [productId, product, productsById, onClose]);

  const category = product?.category_id ? categoriesById.get(product.category_id) : undefined;
  const supplier = product?.supplier_id ? suppliersById.get(product.supplier_id) : undefined;

  return (
    <Modal open={Boolean(product)} title={product?.name ?? ''} onClose={onClose} variant="drawer" width={520}>
      {product && (
        <div className="stack">
          <div className="drawer-head">
            <span className="mono muted">{product.sku}</span>
            <StatusBadge status={stockStatus(product)} />
          </div>

          <div className="drawer-qty">
            <div>
              <span className="drawer-qty__value">{formatInt(product.quantity)}</span>
              <span className="muted"> {product.unit} on hand</span>
            </div>
            <span className="muted small">Reorder at {formatInt(product.reorder_level)}</span>
          </div>

          <div className="btn-row">
            <button className="btn btn--primary" onClick={() => actions.stock(product, 'receive')}>
              <Icon name="arrowIn" size={16} /> Receive
            </button>
            <button className="btn" onClick={() => actions.stock(product, 'ship')} disabled={product.quantity === 0}>
              <Icon name="arrowOut" size={16} /> Ship
            </button>
            <button className="btn" onClick={() => actions.stock(product, 'adjust')}>
              <Icon name="adjust" size={16} /> Count
            </button>
          </div>

          <dl className="facts">
            <div>
              <dt>Category</dt>
              <dd>{category?.name ?? <span className="muted">Uncategorized</span>}</dd>
            </div>
            <div>
              <dt>Supplier</dt>
              <dd>{supplier?.name ?? <span className="muted">None</span>}</dd>
            </div>
            <div>
              <dt>Unit cost</dt>
              <dd>{formatMoney(product.cost_price)}</dd>
            </div>
            <div>
              <dt>Sale price</dt>
              <dd>{formatMoney(product.sale_price)}</dd>
            </div>
            <div>
              <dt>Stock value (cost)</dt>
              <dd>{formatMoney(product.quantity * product.cost_price)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd title={formatDateTime(product.updated_at)}>{formatRelative(product.updated_at)}</dd>
            </div>
          </dl>
          {product.description && <p className="description">{product.description}</p>}

          <section>
            <div className="section-head">
              <h3>Stock history</h3>
              {historyTotal > 0 && (
                <a href={href('/movements', { product: product.id })} onClick={onClose}>
                  View all {formatInt(historyTotal)}
                </a>
              )}
            </div>
            {historyError && <p className="error-text">{historyError}</p>}
            {!history && !historyError && <p className="muted">Loading…</p>}
            {history && history.length === 0 && <p className="muted">No stock movements yet.</p>}
            {history && history.length > 0 && (
              <ul className="timeline">
                {history.map((m) => (
                  <li key={m.id}>
                    <MovementBadge type={m.movement_type} />
                    <div className="timeline__main">
                      <span className="timeline__change">{formatSigned(m.quantity_change)}</span>
                      {m.quantity_after !== null && <span className="muted"> → {formatInt(m.quantity_after)}</span>}
                      {m.note && <div className="muted small">{m.note}</div>}
                    </div>
                    <div className="timeline__meta muted small" title={formatDateTime(m.created_at)}>
                      {formatRelative(m.created_at)}
                      {m.created_by_email && <div>{m.created_by_email}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="btn-row btn-row--end">
            <button className="btn btn--ghost-danger" onClick={() => void actions.remove(product)}>
              <Icon name="trash" size={16} /> Delete
            </button>
            <button className="btn" onClick={() => actions.edit(product)}>
              <Icon name="edit" size={16} /> Edit details
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
