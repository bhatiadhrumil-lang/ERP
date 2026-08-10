import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import * as challanApi from '../services/challans';
import * as customerApi from '../services/customers';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Challan, ChallanStatus, Customer } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pagination } from '../components/ui/Pagination';
import { SearchBox, FilterSelect, Toolbar } from '../components/ui/Toolbar';
import { ChallanStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { CHALLAN_STATUS_LABELS, can } from '../utils/constants';
import { formatDateTime } from '../utils/format';

const LIMIT = 15;

export function ChallansPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Challan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ChallanStatus | ''>('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canCreate = can(user?.role, 'ADMIN', 'SALES');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await challanApi.listChallans({ page, limit: LIMIT, search, status, customerId });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, status, customerId]);

  useEffect(() => {
    void load();
    if (can(user?.role, 'ADMIN', 'SALES', 'ACCOUNTS')) {
      customerApi
        .listCustomers({ limit: 100 })
        .then((r) => setCustomers(r.items))
        .catch(() => undefined);
    }
  }, [load, user]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Sales challans</h2>
          <p className="text-xs text-slate-500">{total} challan{total === 1 ? '' : 's'}</p>
        </div>
        {canCreate ? (
          <Button onClick={() => navigate('/challans/new')}>
            <Plus className="h-4 w-4" /> New challan
          </Button>
        ) : null}
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <Toolbar>
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search challan number…" />
          <FilterSelect
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={Object.entries(CHALLAN_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="All statuses"
          />
          <FilterSelect
            value={customerId}
            onChange={(v) => { setCustomerId(v); setPage(1); }}
            options={customers.map((c) => ({ value: c.id, label: c.businessName }))}
            placeholder="All customers"
          />
        </Toolbar>
      </div>
      <div className="border-t border-slate-100">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="No challans found" message="Create a draft challan to start a sale." action={canCreate ? <Button size="sm" onClick={() => navigate('/challans/new')}>New challan</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Challan</th>
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Units</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Created by</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/challans/${c.id}`} className="font-medium text-indigo-600 hover:underline">
                        {c.challanNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">{c.customer?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{c.customer?.businessName}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.totalQuantity}</td>
                    <td className="px-4 py-3"><ChallanStatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-slate-600">{c.createdBy?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(c.createdAt)}</td>
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
  );
}