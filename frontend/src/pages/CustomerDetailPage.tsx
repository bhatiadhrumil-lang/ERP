import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, CalendarClock, Mail, MapPin, Pencil, Phone, Plus, ReceiptText } from 'lucide-react';
import * as customerApi from '../services/customers';
import * as followUpApi from '../services/followups';
import * as challanApi from '../services/challans';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Challan, Customer, FollowUp, FollowUpStatus } from '../types';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { FollowUpStatusBadge, ChallanStatusBadge, CustomerStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { CUSTOMER_TYPE_LABELS, can } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [challans, setChallans] = useState<Challan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({ followUpDate: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const canEdit = can(user?.role, 'ADMIN', 'SALES');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [c, fu, ch] = await Promise.all([
        customerApi.getCustomer(id),
        followUpApi.listCustomerFollowUps(id, 1, 25),
        challanApi.listChallans({ customerId: id, limit: 25 }),
      ]);
      setCustomer(c);
      setFollowUps(fu.items);
      setChallans(ch.items);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createFollowUp(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await followUpApi.createFollowUp(id, {
        followUpDate: followUpForm.followUpDate,
        notes: followUpForm.notes,
        assignedToId: null,
      });
      toast.success('Follow-up scheduled');
      setFollowUpOpen(false);
      setFollowUpForm({ followUpDate: '', notes: '' });
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function completeFollowUp(f: FollowUp) {
    try {
      await followUpApi.updateFollowUp(f.id, { status: 'COMPLETED' as FollowUpStatus });
      toast.success('Follow-up completed');
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  if (loading) return <Spinner label="Loading customer…" />;
  if (error || !customer) return <ErrorState message={error ?? 'Customer not found'} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">{customer.name}</h2>
            <CustomerStatusBadge status={customer.status} />
          </div>
          <p className="text-sm text-slate-500">
            {customer.customerCode} · {CUSTOMER_TYPE_LABELS[customer.customerType]} · {customer.businessName}
          </p>
        </div>
        {canEdit ? (
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Info */}
        <Card>
          <CardHeader title="Customer information" />
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-slate-400" /> {customer.mobile}</div>
            <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-slate-400" /> {customer.email ?? '—'}</div>
            <div className="flex items-center gap-2 text-slate-600"><MapPin className="h-4 w-4 text-slate-400" /> {customer.address ?? '—'}</div>
            <div className="flex items-center gap-2 text-slate-600"><ReceiptText className="h-4 w-4 text-slate-400" /> {customer.gstNumber ?? 'No GST'}</div>
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarClock className="h-4 w-4 text-slate-400" /> Next follow-up: {formatDate(customer.nextFollowUpDate)}
            </div>
            <div className="flex items-center gap-2 text-slate-600"><Building2 className="h-4 w-4 text-slate-400" /> {customer._count?.salesChallans ?? 0} challans</div>
            {customer.notes ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{customer.notes}</p>
            ) : null}
            <p className="pt-1 text-xs text-slate-400">Created {formatDateTime(customer.createdAt)}</p>
          </CardBody>
        </Card>

        {/* Follow-ups */}
        <Card>
          <CardHeader
            title="Follow-up history"
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setFollowUpOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Schedule
                </Button>
              ) : null
            }
          />
          <CardBody className="p-0">
            {followUps.length === 0 ? (
              <EmptyState title="No follow-ups yet" message="Schedule a follow-up to stay on top of this customer." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {followUps.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-700">{formatDate(f.followUpDate)}</p>
                      <FollowUpStatusBadge status={f.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{f.notes}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      By {f.createdBy?.name ?? '—'} · {formatDateTime(f.createdAt)}
                    </p>
                    {f.status === 'PENDING' && canEdit ? (
                      <button
                        onClick={() => void completeFollowUp(f)}
                        className="mt-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Mark completed
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Challans */}
        <Card>
          <CardHeader title="Sales challans" />
          <CardBody className="p-0">
            {challans.length === 0 ? (
              <EmptyState title="No challans" message="Create a challan for this customer from the Challans page." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {challans.map((c) => (
                  <li key={c.id}>
                    <Link to={`/challans/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-700 hover:text-indigo-600">{c.challanNumber}</p>
                        <p className="text-xs text-slate-400">{formatDateTime(c.createdAt)} · {c.totalQuantity} units</p>
                      </div>
                      <ChallanStatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Edit customer (reuses the same payload shape) */}
      <Modal open={editOpen} title="Edit customer" onClose={() => setEditOpen(false)} wide>
        <CustomerEditForm
          customer={customer}
          onDone={() => { setEditOpen(false); void load(); }}
        />
      </Modal>

      <Modal open={followUpOpen} title="Schedule follow-up" onClose={() => setFollowUpOpen(false)}>
        <form onSubmit={createFollowUp} className="space-y-4">
          <Field label="Follow-up date" required>
            <Input type="date" required value={followUpForm.followUpDate} onChange={(e) => setFollowUpForm({ ...followUpForm, followUpDate: e.target.value })} />
          </Field>
          <Field label="Notes" required>
            <Textarea rows={3} required value={followUpForm.notes} onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })} placeholder="What to discuss on the call…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFollowUpOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Schedule</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CustomerEditForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: customer.name,
    mobile: customer.mobile,
    email: customer.email ?? '',
    businessName: customer.businessName,
    gstNumber: customer.gstNumber ?? '',
    customerType: customer.customerType,
    status: customer.status,
    address: customer.address ?? '',
    notes: customer.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await customerApi.updateCustomer(customer.id, {
        ...form,
        email: form.email || undefined,
        gstNumber: form.gstNumber || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Customer updated');
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Business name" required><Input required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
        <Field label="Mobile" required><Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
        <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" loading={saving}>Save changes</Button>
      </div>
    </form>
  );
}