import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Field } from '../components/ProductForm';
import { deleteSupplier, friendlyError, saveSupplier } from '../lib/api';
import { formatInt, stockStatus } from '../lib/format';
import { useInventory } from '../lib/inventory';
import { href } from '../lib/router';
import type { Supplier, SupplierInput } from '../lib/types';

export function Suppliers() {
  const { suppliers, products, refresh } = useInventory();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<{ open: boolean; supplier: Supplier | null }>({ open: false, supplier: null });

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; reorder: number }>();
    for (const p of products) {
      if (!p.supplier_id) continue;
      const s = m.get(p.supplier_id) ?? { count: 0, reorder: 0 };
      s.count += 1;
      if (stockStatus(p) !== 'in') s.reorder += 1;
      m.set(p.supplier_id, s);
    }
    return m;
  }, [products]);

  async function remove(s: Supplier) {
    const count = stats.get(s.id)?.count ?? 0;
    const ok = await confirm({
      title: 'Delete supplier?',
      message: (
        <p>
          <strong>{s.name}</strong> will be deleted.
          {count > 0 && ` ${count} product${count === 1 ? '' : 's'} will be left without a supplier.`}
        </p>
      ),
      confirmLabel: 'Delete supplier',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSupplier(s.id);
      toast(`Deleted ${s.name}`);
      await refresh();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Suppliers</h1>
          <p className="muted">{formatInt(suppliers.length)} suppliers</p>
        </div>
        <button className="btn btn--primary" onClick={() => setEditing({ open: true, supplier: null })}>
          <Icon name="plus" size={16} /> New supplier
        </button>
      </header>

      {suppliers.length === 0 ? (
        <div className="empty card">
          <Icon name="truck" size={32} />
          <h2>No suppliers yet</h2>
          <p className="muted">Track who you buy from, then filter products by supplier when it is time to reorder.</p>
          <button className="btn btn--primary" onClick={() => setEditing({ open: true, supplier: null })}>
            <Icon name="plus" size={16} /> Add supplier
          </button>
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="num">Products</th>
                <th className="num">Need reorder</th>
                <th className="actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => {
                const st = stats.get(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <a className="cell-title" href={href('/products', { supplier: s.id })}>
                        {s.name}
                      </a>
                    </td>
                    <td>{s.contact_name || <span className="muted">—</span>}</td>
                    <td>{s.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : <span className="muted">—</span>}</td>
                    <td className="nowrap">{s.phone || <span className="muted">—</span>}</td>
                    <td className="num">{formatInt(st?.count ?? 0)}</td>
                    <td className="num">
                      {st?.reorder ? <a href={href('/products', { supplier: s.id, status: 'attention' })}>{st.reorder}</a> : <span className="muted">0</span>}
                    </td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => setEditing({ open: true, supplier: s })} aria-label={`Edit ${s.name}`} title="Edit">
                          <Icon name="edit" size={16} />
                        </button>
                        <button className="icon-btn icon-btn--danger" onClick={() => void remove(s)} aria-label={`Delete ${s.name}`} title="Delete">
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

      <SupplierModal
        open={editing.open}
        supplier={editing.supplier}
        onClose={() => setEditing((e) => ({ ...e, open: false }))}
        onSaved={async (name, isNew) => {
          toast(isNew ? `Added ${name}` : `Saved ${name}`);
          await refresh();
        }}
      />
    </div>
  );
}

const EMPTY: SupplierInput = { name: '', contact_name: '', email: '', phone: '' };

function SupplierModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => Promise<void>;
}) {
  const formId = useId();
  const [fields, setFields] = useState<SupplierInput>(EMPTY);
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields(
      supplier
        ? { name: supplier.name, contact_name: supplier.contact_name ?? '', email: supplier.email ?? '', phone: supplier.phone ?? '' }
        : EMPTY,
    );
    setErrors({});
  }, [open, supplier]);

  const set = (key: keyof SupplierInput) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (!fields.name.trim()) found.name = 'Name is required.';
    const email = fields.email?.trim() ?? '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = 'Enter a valid email address.';
    setErrors(found);
    if (Object.keys(found).length) return;

    const clean = (v: string | null) => v?.trim() || null;
    setSaving(true);
    try {
      await saveSupplier(supplier?.id ?? null, {
        name: fields.name.trim(),
        contact_name: clean(fields.contact_name),
        email: clean(fields.email),
        phone: clean(fields.phone),
      });
      await onSaved(fields.name.trim(), !supplier);
      onClose();
    } catch (err) {
      setErrors({ form: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={supplier ? 'Edit supplier' : 'New supplier'}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : supplier ? 'Save changes' : 'Add supplier'}
          </button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={onSubmit} noValidate>
        {errors.form && <div className="banner banner--error field--wide">{errors.form}</div>}
        <Field label="Company name" error={errors.name} wide>
          <input value={fields.name} onChange={set('name')} autoFocus maxLength={200} />
        </Field>
        <Field label="Contact person">
          <input value={fields.contact_name ?? ''} onChange={set('contact_name')} maxLength={200} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={fields.phone ?? ''} onChange={set('phone')} maxLength={50} />
        </Field>
        <Field label="Email" error={errors.email} wide>
          <input type="email" value={fields.email ?? ''} onChange={set('email')} maxLength={200} />
        </Field>
      </form>
    </Modal>
  );
}
