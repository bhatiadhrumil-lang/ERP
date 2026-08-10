import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, History, LayoutGrid, Plus } from 'lucide-react';
import * as invApi from '../services/inventory';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { InventoryRow, Movement, MovementType } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { SearchBox, FilterSelect, Toolbar } from '../components/ui/Toolbar';
import { MovementBadge, StockStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { can } from '../utils/constants';
import { formatDateTime } from '../utils/format';

type Tab = 'stock' | 'movements';

export function InventoryPage({ tab: initialTab }: { tab: Tab }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tab = (location.pathname.endsWith('/movements') ? 'movements' : initialTab) as Tab;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm w-fit">
        <button
          onClick={() => navigate('/inventory')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === 'stock' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <LayoutGrid className="h-4 w-4" /> Stock
        </button>
        {can(user?.role, 'ADMIN', 'WAREHOUSE') ? (
          <button
            onClick={() => navigate('/inventory/movements')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === 'movements' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <History className="h-4 w-4" /> Movements
          </button>
        ) : null}
      </div>
      {tab === 'stock' ? <StockTab /> : <MovementsTab />}
    </div>
  );
}

function StockTab() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adjustTarget, setAdjustTarget] = useState<InventoryRow | null>(null);
  const [adjustForm, setAdjustForm] = useState<{ movementType: MovementType; quantity: string; reason: string }>({
    movementType: 'IN',
    quantity: '',
    reason: '',
  });
  const [adjusting, setAdjusting] = useState(false);

  const canAdjust = can(user?.role, 'ADMIN', 'WAREHOUSE');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invApi.listInventory({ page, limit: 12, search, lowStock: lowStock || undefined });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, lowStock]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    setAdjusting(true);
    try {
      await invApi.adjustStock(adjustTarget.productId, {
        movementType: adjustForm.movementType,
        quantity: parseInt(adjustForm.quantity, 10),
        reason: adjustForm.reason,
      });
      toast.success(`Stock ${adjustForm.movementType === 'IN' ? 'received' : 'issued'} — ledger updated`);
      setAdjustTarget(null);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Inventory</h2>
            <p className="text-xs text-slate-500">{total} product{total === 1 ? '' : 's'} tracked</p>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <Toolbar>
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search SKU or name…" />
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
            <EmptyState title="No inventory records" message="Adjust filters or add products first." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 font-semibold">Quantity</th>
                    <th className="px-4 py-2.5 font-semibold">Stock status</th>
                    <th className="px-4 py-2.5 font-semibold">Min stock</th>
                    <th className="px-4 py-2.5 font-semibold">Location</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{r.product.name}</p>
                        <p className="text-xs text-slate-400">{r.product.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.product.category}</td>
                      <td className="px-4 py-3">
                        <span className={`text-base font-bold ${r.stockStatus === 'OK' ? 'text-slate-800' : r.stockStatus === 'LOW' ? 'text-amber-600' : 'text-red-600'}`}>
                          {r.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StockStatusBadge status={r.stockStatus ?? 'OK'} /></td>
                      <td className="px-4 py-3 text-slate-600">{r.product.minimumStock}</td>
                      <td className="px-4 py-3 text-slate-600">{r.product.warehouseLocation}</td>
                      <td className="px-4 py-3">
                        {canAdjust ? (
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setAdjustTarget(r);
                                setAdjustForm({ movementType: 'IN', quantity: '', reason: '' });
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" /> Adjust
                            </Button>
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

      <Modal
        open={adjustTarget !== null}
        title={`Adjust stock — ${adjustTarget?.product.name ?? ''}`}
        onClose={() => setAdjustTarget(null)}
      >
        {adjustTarget ? (
          <form onSubmit={onAdjust} className="space-y-4">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Current stock: <strong>{adjustTarget.quantity}</strong> {adjustTarget.product.sku} — every adjustment is
              written to the audit ledger.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type" required>
                <Select
                  value={adjustForm.movementType}
                  onChange={(e) => setAdjustForm({ ...adjustForm, movementType: e.target.value as MovementType })}
                >
                  <option value="IN">Stock in (receive)</option>
                  <option value="OUT">Stock out (issue)</option>
                </Select>
              </Field>
              <Field label="Quantity" required>
                <Input
                  required
                  type="number"
                  min="1"
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Reason" required>
              <Textarea rows={2} required value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="e.g. Received PO-1024 / Damaged during transit" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAdjustTarget(null)}>Cancel</Button>
              <Button type="submit" loading={adjusting} variant={adjustForm.movementType === 'OUT' ? 'danger' : 'success'}>
                {adjustForm.movementType === 'IN' ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                Apply adjustment
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}

function MovementsTab() {
  const [items, setItems] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [movementType, setMovementType] = useState<MovementType | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invApi.listMovements({ page, limit: 15, movementType });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, movementType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Inventory movement ledger</h2>
          <p className="text-xs text-slate-500">{total} movement{total === 1 ? '' : 's'} — audit history is immutable</p>
        </div>
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <Toolbar>
          <FilterSelect
            value={movementType}
            onChange={(v) => { setMovementType(v); setPage(1); }}
            options={[{ value: 'IN', label: 'Stock in (IN)' }, { value: 'OUT', label: 'Stock out (OUT)' }]}
            placeholder="All types"
          />
        </Toolbar>
      </div>
      <div className="border-t border-slate-100">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="No movements" message="Stock adjustments and challan confirmations appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Quantity</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">By</th>
                  <th className="px-4 py-2.5 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{m.product?.name ?? '—'}</p>
                      <p className="text-xs text-slate-400">{m.product?.sku}</p>
                    </td>
                    <td className="px-4 py-3"><MovementBadge type={m.movementType} /></td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{m.quantity}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">{m.reason}</td>
                    <td className="px-4 py-3 text-slate-600">{m.createdBy?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(m.createdAt)}</td>
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