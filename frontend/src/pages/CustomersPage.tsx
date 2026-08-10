import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as customerApi from '../services/customers';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Customer, CustomerStatus, CustomerType } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { SearchBox, FilterSelect, Toolbar } from '../components/ui/Toolbar';
import { CustomerStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TYPE_LABELS, can } from '../utils/constants';
import { formatDate, toDateInputValue } from '../utils/format';

const EMPTY_FORM = {
  name: '',
  mobile: '',
  email: '',
  businessName: '',
  gstNumber: '',
  customerType: 'RETAIL' as CustomerType,
  status: 'ACTIVE' as CustomerStatus,
  address: '',
  nextFollowUpDate: '',
  notes: '',
};

export function CustomersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType | ''>('');
  const [status, setStatus] = useState<CustomerStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = can(user?.role, 'ADMIN', 'SALES');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await customerApi.listCustomers({ page, limit: 12, search, customerType, status });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, customerType, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      mobile: c.mobile,
      email: c.email ?? '',
      businessName: c.businessName,
      gstNumber: c.gstNumber ?? '',
      customerType: c.customerType,
      status: c.status,
      address: c.address ?? '',
      nextFollowUpDate: toDateInputValue(c.nextFollowUpDate),
      notes: c.notes ?? '',
    });
    setModalOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email || undefined,
        gstNumber: form.gstNumber || undefined,
        address: form.address || undefined,
        nextFollowUpDate: form.nextFollowUpDate || undefined,
        notes: form.notes || undefined,
      };
      if (editing) {
        await customerApi.updateCustomer(editing.id, payload);
        toast.success('Customer updated');
      } else {
        await customerApi.createCustomer(payload);
        toast.success('Customer created');
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
      await customerApi.deleteCustomer(deleteTarget.id);
      toast.success('Customer deleted');
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
            <h2 className="text-sm font-semibold text-slate-800">Customers</h2>
            <p className="text-xs text-slate-500">{total} customer{total === 1 ? '' : 's'}</p>
          </div>
          {canEdit ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New customer
            </Button>
          ) : null}
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <Toolbar>
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, business, mobile…" />
            <FilterSelect
              value={customerType}
              onChange={(v) => { setCustomerType(v); setPage(1); }}
              options={Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder="All types"
            />
            <FilterSelect
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder="All statuses"
            />
          </Toolbar>
        </div>
        <div className="border-t border-slate-100">
          {loading ? (
            <Spinner />
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={() => void load()} />
          ) : items.length === 0 ? (
            <EmptyState title="No customers found" message="Try changing your filters, or create your first customer." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">Type</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Mobile</th>
                    <th className="px-4 py-2.5 font-semibold">Next follow-up</th>
                    <th className="px-4 py-2.5 font-semibold">Challans</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link to={`/customers/${c.id}`} className="block">
                          <p className="font-medium text-slate-800 hover:text-indigo-600">{c.name}</p>
                          <p className="text-xs text-slate-400">
                            {c.customerCode} · {c.businessName}
                          </p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{CUSTOMER_TYPE_LABELS[c.customerType]}</td>
                      <td className="px-4 py-3"><CustomerStatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-slate-600">{c.mobile}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(c.nextFollowUpDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{c._count?.salesChallans ?? 0}</td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <div className="flex justify-end gap-1">
                            <button
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                              onClick={() => openEdit(c)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => setDeleteTarget(c)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </div>
      </Card>

      <Modal open={modalOpen} title={editing ? `Edit customer — ${editing.name}` : 'New customer'} onClose={() => setModalOpen(false)} wide>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contact person name" />
            </Field>
            <Field label="Business name" required>
              <Input required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Trading name" />
            </Field>
            <Field label="Mobile" required>
              <Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="+91 …" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="billing@example.com" />
            </Field>
            <Field label="Customer type" required>
              <Select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value as CustomerType })}>
                {Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CustomerStatus })}>
                {Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="GST number">
              <Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} placeholder="27XXXXX0000X0X0" />
            </Field>
            <Field label="Next follow-up date">
              <Input type="date" value={form.nextFollowUpDate} onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, city, state" />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, preferences, history…" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Create customer'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete customer"
        message={`Delete ${deleteTarget?.name} (${deleteTarget?.customerCode})? This cannot be undone. Customers with challans or follow-up history cannot be deleted.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}