import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as productApi from '../services/products';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Product } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { SearchBox, FilterSelect, Toolbar } from '../components/ui/Toolbar';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { can } from '../utils/constants';
import { formatMoney } from '../utils/format';

const EMPTY_FORM = {
  sku: '',
  name: '',
  category: '',
  unitPrice: '',
  minimumStock: '5',
  warehouseLocation: '',
  initialQuantity: '0',
};

export function ProductsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = can(user?.role, 'ADMIN', 'WAREHOUSE');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await productApi.listProducts({ page, limit: 12, search, category, lowStock: lowStock || undefined });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, category, lowStock]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      sku: p.sku,
      name: p.name,
      category: p.category,
      unitPrice: p.unitPrice,
      minimumStock: String(p.minimumStock),
      warehouseLocation: p.warehouseLocation,
      initialQuantity: '0',
    });
    setModalOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        sku: form.sku,
        name: form.name,
        category: form.category,
        unitPrice: parseFloat(form.unitPrice),
        minimumStock: parseInt(form.minimumStock, 10) || 0,
        warehouseLocation: form.warehouseLocation,
        initialQuantity: editing ? undefined : parseInt(form.initialQuantity, 10) || 0,
      };
      if (editing) {
        await productApi.updateProduct(editing.id, payload);
        toast.success('Product updated');
      } else {
        await productApi.createProduct(payload);
        toast.success('Product created');
      }
      setModalOpen(false);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await productApi.deleteProduct(deleteTarget.id);
      toast.success('Product deleted');
      setDeleteTarget(null);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Products</h2>
            <p className="text-xs text-slate-500">{total} product{total === 1 ? '' : 's'}</p>
          </div>
          {canEdit ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          ) : null}
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <Toolbar>
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search SKU or name…" />
            <FilterSelect
              value={category}
              onChange={(v) => { setCategory(v); setPage(1); }}
              options={['Electrical', 'Plumbing', 'Hardware', 'Power Tools'].map((c) => ({ value: c, label: c }))}
              placeholder="All categories"
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={lowStock}
                onChange={(e) => { setLowStock(e.target.checked); setPage(1); }}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Low stock only
            </label>
          </Toolbar>
        </div>
        <div className="border-t border-slate-100">
          {loading ? (
            <Spinner />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : items.length === 0 ? (
            <EmptyState title="No products found" message="Try changing filters or create a new product." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 font-semibold">Unit price</th>
                    <th className="px-4 py-2.5 font-semibold">Stock</th>
                    <th className="px-4 py-2.5 font-semibold">Min stock</th>
                    <th className="px-4 py-2.5 font-semibold">Location</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((p) => {
                    const qty = p.inventory?.quantity ?? 0;
                    const low = qty <= p.minimumStock;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.category}</td>
                        <td className="px-4 py-3 text-slate-600">{formatMoney(p.unitPrice)}</td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${qty === 0 ? 'text-red-600' : low ? 'text-amber-600' : 'text-slate-700'}`}>{qty}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.minimumStock}</td>
                        <td className="px-4 py-3 text-slate-600">{p.warehouseLocation}</td>
                        <td className="px-4 py-3">
                          {p.isActive ? <Badge tone="emerald">active</Badge> : <Badge tone="gray">inactive</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <div className="flex justify-end gap-1">
                              <button
                                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                                onClick={() => openEdit(p)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                onClick={() => setDeleteTarget(p)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </div>
      </Card>

      <Modal open={modalOpen} title={editing ? `Edit product — ${editing.sku}` : 'New product'} onClose={() => setModalOpen(false)} wide>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="SKU" required>
              <Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU-EL-001" />
            </Field>
            <Field label="Name" required>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category" required>
              <Input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Unit price (INR)" required>
              <Input required type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
            </Field>
            <Field label="Minimum stock" required>
              <Input required type="number" min="0" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
            </Field>
            <Field label="Warehouse location" required>
              <Input required value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} placeholder="Aisle-A1" />
            </Field>
            {!editing ? (
              <Field label="Initial stock quantity" hint="Creates an IN movement on the audit ledger">
                <Input type="number" min="0" value={form.initialQuantity} onChange={(e) => setForm({ ...form, initialQuantity: e.target.value })} />
              </Field>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Create product'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete product"
        message={`Delete ${deleteTarget?.name} (${deleteTarget?.sku})? Products with stock movements or challan history cannot be deleted — deactivate them instead.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}