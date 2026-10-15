import { useEffect, useId, useState, type FormEvent } from 'react';
import { createProduct, friendlyError, recordMovement, updateProduct } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useInventory } from '../lib/inventory';
import type { Product, ProductInput } from '../lib/types';
import { useFeedback } from './Feedback';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  /** The product to edit, or null to create a new one. */
  product: Product | null;
  onClose: () => void;
}

const UNITS = ['pcs', 'box', 'pack', 'case', 'pair', 'set', 'kg', 'g', 'lb', 'l', 'ml', 'm', 'ream', 'roll', 'bottle'];

interface Fields {
  name: string;
  sku: string;
  category_id: string;
  supplier_id: string;
  unit: string;
  cost_price: string;
  sale_price: string;
  reorder_level: string;
  initial_stock: string;
  description: string;
}

function toFields(p: Product | null): Fields {
  return {
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    category_id: p?.category_id ?? '',
    supplier_id: p?.supplier_id ?? '',
    unit: p?.unit ?? 'pcs',
    cost_price: p ? String(p.cost_price) : '',
    sale_price: p ? String(p.sale_price) : '',
    reorder_level: p ? String(p.reorder_level) : '0',
    initial_stock: '0',
    description: p?.description ?? '',
  };
}

type Errors = Partial<Record<keyof Fields, string>>;

function validate(f: Fields, skus: Set<string>): Errors {
  const errors: Errors = {};
  if (!f.name.trim()) errors.name = 'Name is required.';
  if (!f.sku.trim()) errors.sku = 'SKU is required.';
  else if (skus.has(f.sku.trim().toLowerCase())) errors.sku = 'Another product already uses this SKU.';
  if (!f.unit.trim()) errors.unit = 'Unit is required.';
  for (const key of ['cost_price', 'sale_price'] as const) {
    const n = Number(f[key]);
    if (f[key].trim() === '' || !Number.isFinite(n) || n < 0) errors[key] = 'Enter an amount of 0 or more.';
  }
  for (const key of ['reorder_level', 'initial_stock'] as const) {
    const n = Number(f[key]);
    if (!Number.isInteger(n) || n < 0) errors[key] = 'Enter a whole number of 0 or more.';
  }
  return errors;
}

export function ProductFormModal({ open, product, onClose }: Props) {
  const { categories, suppliers, products, refresh } = useInventory();
  const { toast } = useFeedback();
  const formId = useId();
  const [fields, setFields] = useState<Fields>(() => toFields(product));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFields(toFields(product));
      setErrors({});
    }
  }, [open, product]);

  const set = (key: keyof Fields) => (e: { target: { value: string } }) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const cost = Number(fields.cost_price);
  const price = Number(fields.sale_price);
  const margin = price > 0 && Number.isFinite(cost) ? ((price - cost) / price) * 100 : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const otherSkus = new Set(products.filter((p) => p.id !== product?.id).map((p) => p.sku.toLowerCase()));
    const found = validate(fields, otherSkus);
    setErrors(found);
    if (Object.keys(found).length) return;

    const input: ProductInput = {
      name: fields.name.trim(),
      sku: fields.sku.trim(),
      category_id: fields.category_id || null,
      supplier_id: fields.supplier_id || null,
      unit: fields.unit.trim(),
      cost_price: Number(fields.cost_price),
      sale_price: Number(fields.sale_price),
      reorder_level: Number(fields.reorder_level),
      description: fields.description.trim() || null,
    };

    setSaving(true);
    try {
      if (product) {
        await updateProduct(product.id, input);
        toast(`Saved ${input.name}`);
      } else {
        const created = await createProduct(input);
        const opening = Number(fields.initial_stock);
        if (opening > 0) {
          try {
            await recordMovement({ product_id: created.id, movement_type: 'receive', quantity_change: opening, note: 'Opening stock' });
          } catch (err) {
            toast(`Product created, but the opening stock was not recorded: ${friendlyError(err)}`, 'error');
          }
        }
        toast(`Added ${input.name}`);
      }
      await refresh();
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={product ? 'Edit product' : 'New product'}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
          </button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={onSubmit} noValidate>
        <Field label="Name" error={errors.name} wide>
          <input value={fields.name} onChange={set('name')} autoFocus required maxLength={200} />
        </Field>
        <Field label="SKU" error={errors.sku} hint="Unique stock-keeping code">
          <input value={fields.sku} onChange={set('sku')} required maxLength={64} className="mono" />
        </Field>
        <Field label="Unit" error={errors.unit}>
          <input value={fields.unit} onChange={set('unit')} list="unit-options" required maxLength={20} />
          <datalist id="unit-options">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field label="Category">
          <select value={fields.category_id} onChange={set('category_id')}>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier">
          <select value={fields.supplier_id} onChange={set('supplier_id')}>
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit cost" error={errors.cost_price}>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={fields.cost_price} onChange={set('cost_price')} placeholder="0.00" />
        </Field>
        <Field
          label="Sale price"
          error={errors.sale_price}
          hint={margin !== null && !errors.sale_price ? `Margin ${margin.toFixed(0)}% (${formatMoney(price - (cost || 0))} per unit)` : undefined}
        >
          <input type="number" inputMode="decimal" min={0} step="0.01" value={fields.sale_price} onChange={set('sale_price')} placeholder="0.00" />
        </Field>
        <Field label="Reorder level" error={errors.reorder_level} hint="Flag as low stock at or below this">
          <input type="number" inputMode="numeric" min={0} step={1} value={fields.reorder_level} onChange={set('reorder_level')} />
        </Field>
        {product ? (
          <Field label="On hand" hint="Change stock with Receive, Ship or Count">
            <input value={`${product.quantity} ${product.unit}`} readOnly disabled />
          </Field>
        ) : (
          <Field label="Opening stock" error={errors.initial_stock} hint="Recorded as a receipt in stock history">
            <input type="number" inputMode="numeric" min={0} step={1} value={fields.initial_stock} onChange={set('initial_stock')} />
          </Field>
        )}
        <Field label="Description" wide>
          <textarea value={fields.description} onChange={set('description')} rows={3} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}

export function Field({
  label,
  error,
  hint,
  wide,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`field${wide ? ' field--wide' : ''}${error ? ' field--error' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
