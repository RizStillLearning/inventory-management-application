import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Field } from '../components/ProductForm';
import { deleteCategory, friendlyError, saveCategory } from '../lib/api';
import { formatInt, formatMoney } from '../lib/format';
import { useInventory } from '../lib/inventory';
import { href } from '../lib/router';
import type { Category } from '../lib/types';

export function Categories() {
  const { categories, products, refresh } = useInventory();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<{ open: boolean; category: Category | null }>({ open: false, category: null });

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; units: number; value: number }>();
    for (const p of products) {
      if (!p.category_id) continue;
      const s = m.get(p.category_id) ?? { count: 0, units: 0, value: 0 };
      s.count += 1;
      s.units += p.quantity;
      s.value += p.quantity * p.cost_price;
      m.set(p.category_id, s);
    }
    return m;
  }, [products]);

  const uncategorized = products.filter((p) => !p.category_id).length;

  async function remove(c: Category) {
    const count = stats.get(c.id)?.count ?? 0;
    const ok = await confirm({
      title: 'Delete category?',
      message: (
        <p>
          <strong>{c.name}</strong> will be deleted.
          {count > 0 && ` Its ${count} product${count === 1 ? '' : 's'} will become uncategorized; nothing else changes.`}
        </p>
      ),
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCategory(c.id);
      toast(`Deleted ${c.name}`);
      await refresh();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Categories</h1>
          <p className="muted">
            {formatInt(categories.length)} categories
            {uncategorized > 0 && (
              <>
                {' · '}
                <a href={href('/products', { category: 'none' })}>{uncategorized} uncategorized products</a>
              </>
            )}
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setEditing({ open: true, category: null })}>
          <Icon name="plus" size={16} /> New category
        </button>
      </header>

      {categories.length === 0 ? (
        <div className="empty card">
          <Icon name="tag" size={32} />
          <h2>No categories yet</h2>
          <p className="muted">Group products into categories to filter them and see stock value per group.</p>
          <button className="btn btn--primary" onClick={() => setEditing({ open: true, category: null })}>
            <Icon name="plus" size={16} /> Add category
          </button>
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th className="num">Products</th>
                <th className="num">Units</th>
                <th className="num">Stock value</th>
                <th className="actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const s = stats.get(c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      <a className="cell-title" href={href('/products', { category: c.id })}>
                        {c.name}
                      </a>
                    </td>
                    <td className="muted">{c.description || '—'}</td>
                    <td className="num">{formatInt(s?.count ?? 0)}</td>
                    <td className="num">{formatInt(s?.units ?? 0)}</td>
                    <td className="num">{formatMoney(s?.value ?? 0)}</td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => setEditing({ open: true, category: c })} aria-label={`Edit ${c.name}`} title="Edit">
                          <Icon name="edit" size={16} />
                        </button>
                        <button className="icon-btn icon-btn--danger" onClick={() => void remove(c)} aria-label={`Delete ${c.name}`} title="Delete">
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CategoryModal
        open={editing.open}
        category={editing.category}
        onClose={() => setEditing((e) => ({ ...e, open: false }))}
        onSaved={async (name, isNew) => {
          toast(isNew ? `Added ${name}` : `Saved ${name}`);
          await refresh();
        }}
      />
    </div>
  );
}

function CategoryModal({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => Promise<void>;
}) {
  const formId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setError(null);
  }, [open, category]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setSaving(true);
    try {
      await saveCategory(category?.id ?? null, { name: name.trim(), description: description.trim() || null });
      await onSaved(name.trim(), !category);
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={category ? 'Edit category' : 'New category'}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : category ? 'Save changes' : 'Add category'}
          </button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit} noValidate>
        <Field label="Name" error={error ?? undefined}>
          <input value={name} onChange={(e) => (setName(e.target.value), setError(null))} autoFocus maxLength={100} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}
