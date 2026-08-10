import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import * as followUpApi from '../services/followups';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import type { FollowUp, FollowUpStatus } from '../types';
import { Card } from '../components/ui/Card';
import { Pagination } from '../components/ui/Pagination';
import { FilterSelect, Toolbar } from '../components/ui/Toolbar';
import { FollowUpStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { FOLLOWUP_STATUS_LABELS } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';

export function FollowUpsPage() {
  const toast = useToast();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FollowUpStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await followUpApi.listFollowUps({ page, limit: 15, status });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatusOf(f: FollowUp, next: 'COMPLETED' | 'CANCELLED') {
    try {
      await followUpApi.updateFollowUp(f.id, { status: next });
      toast.success(next === 'COMPLETED' ? 'Follow-up completed' : 'Follow-up cancelled');
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  function isOverdue(f: FollowUp): boolean {
    return f.status === 'PENDING' && new Date(f.followUpDate) < new Date();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Customer follow-ups</h2>
          <p className="text-xs text-slate-500">{total} follow-up{total === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <Toolbar>
          <FilterSelect
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={Object.entries(FOLLOWUP_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="All statuses"
          />
        </Toolbar>
      </div>
      <div className="border-t border-slate-100">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="No follow-ups" message="Schedule follow-ups from a customer's profile page." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Due date</th>
                  <th className="px-4 py-2.5 font-semibold">Notes</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/customers/${f.customerId}`} className="font-medium text-slate-800 hover:text-indigo-600">
                        {f.customer?.name ?? '—'}
                      </Link>
                      <p className="text-xs text-slate-400">{f.customer?.businessName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={isOverdue(f) ? 'font-medium text-red-600' : 'text-slate-600'}>{formatDate(f.followUpDate)}</span>
                      {isOverdue(f) ? <p className="text-[11px] text-red-500">overdue</p> : null}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">{f.notes}</td>
                    <td className="px-4 py-3"><FollowUpStatusBadge status={f.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(f.createdAt)}</td>
                    <td className="px-4 py-3">
                      {f.status === 'PENDING' ? (
                        <div className="flex justify-end gap-1">
                          <button
                            className="rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title="Mark completed"
                            onClick={() => void setStatusOf(f, 'COMPLETED')}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Cancel follow-up"
                            onClick={() => void setStatusOf(f, 'CANCELLED')}
                          >
                            <XCircle className="h-4 w-4" />
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
  );
}