import { useEffect, useId, useState, type FormEvent } from 'react';
import { friendlyError, recordMovement } from '../lib/api';
import { formatInt } from '../lib/format';
import { useInventory } from '../lib/inventory';
import type { MovementType, Product } from '../lib/types';
import { useFeedback } from './Feedback';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';
import { Field } from './ProductForm';

interface Props {
  product: Product | null;
  initialType?: MovementType;
  suggestedQuantity?: number;
  onClose: () => void;
}

const TYPES: { type: MovementType; label: string; icon: IconName; help: string }[] = [
  { type: 'receive', label: 'Receive', icon: 'arrowIn', help: 'Stock arriving from a supplier or a return.' },
  { type: 'ship', label: 'Ship', icon: 'arrowOut', help: 'Stock leaving for an order, transfer or use.' },
  { type: 'adjust', label: 'Count', icon: 'adjust', help: 'Set the on-hand quantity to what you counted.' },
];

export function StockModal({ product, initialType = 'receive', suggestedQuantity, onClose }: Props) {
  const { productsById, refresh } = useInventory();
  const { toast } = useFeedback();
  const formId = useId();
  const [type, setType] = useState<MovementType>(initialType);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Always read the live quantity, which may change while the dialog is open.
  const live = product ? productsById.get(product.id) ?? product : null;
  const onHand = live?.quantity ?? 0;

  useEffect(() => {
    if (!product) return;
    setType(initialType);
    setAmount(suggestedQuantity ? String(suggestedQuantity) : '');
    setNote('');
    setError(null);
  }, [product, initialType, suggestedQuantity]);

  const n = Number(amount);
  const valid = amount.trim() !== '' && Number.isInteger(n) && n >= 0;
  const change = !valid ? 0 : type === 'receive' ? n : type === 'ship' ? -n : n - onHand;
  const after = onHand + change;

  function switchType(next: MovementType) {
    setType(next);
    setError(null);
    if (next === 'adjust' && type !== 'adjust') setAmount(String(onHand));
    if (next !== 'adjust' && type === 'adjust') setAmount('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!live) return;
    if (!valid) return setError('Enter a whole number of 0 or more.');
    if (type !== 'adjust' && n === 0) return setError('Enter a quantity greater than 0.');
    if (change === 0) return setError(`The count matches what is on hand (${formatInt(onHand)}), so there is nothing to record.`);
    if (after < 0) return setError(`Only ${formatInt(onHand)} ${live.unit} on hand.`);

    setSaving(true);
    try {
      await recordMovement({ product_id: live.id, movement_type: type, quantity_change: change, note: note.trim() || null });
      const verb = type === 'receive' ? 'Received' : type === 'ship' ? 'Shipped' : 'Adjusted';
      toast(`${verb} ${formatInt(Math.abs(change))} ${live.unit} of ${live.name}. On hand: ${formatInt(after)}`);
      await refresh();
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  const current = TYPES.find((t) => t.type === type)!;

  return (
    <Modal
      open={product !== null}
      title="Update stock"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : `Record ${current.label.toLowerCase()}`}
          </button>
        </>
      }
    >
      {live && (
        <form id={formId} onSubmit={onSubmit} className="stack" noValidate>
          <div className="stock-product">
            <div>
              <div className="stock-product__name">{live.name}</div>
              <div className="muted mono">{live.sku}</div>
            </div>
            <div className="stock-product__qty">
              <span className="muted">On hand</span>
              <strong>
                {formatInt(onHand)} <span className="muted">{live.unit}</span>
              </strong>
            </div>
          </div>

          <div className="segmented" role="radiogroup" aria-label="Movement type">
            {TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                role="radio"
                aria-checked={type === t.type}
                className={type === t.type ? 'is-active' : ''}
                onClick={() => switchType(t.type)}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted small">{current.help}</p>

          <Field label={type === 'adjust' ? 'Counted quantity' : `Quantity (${live.unit})`} error={error ?? undefined}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              autoFocus
            />
          </Field>

          <div className={`stock-preview${valid && after < 0 ? ' stock-preview--bad' : ''}`} aria-live="polite">
            <span>{formatInt(onHand)}</span>
            <Icon name="chevron" size={16} />
            <strong>{valid ? formatInt(after) : '—'}</strong>
            <span className="muted">{live.unit} after this</span>
            {valid && change !== 0 && <span className="stock-preview__delta">({change > 0 ? '+' : '−'}{formatInt(Math.abs(change))})</span>}
          </div>

          <Field label="Note" hint="Optional: order number, reason, reference">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={type === 'ship' ? 'e.g. Order #1234' : type === 'receive' ? 'e.g. PO-5678' : 'e.g. Cycle count'} />
          </Field>
        </form>
      )}
    </Modal>
  );
}
