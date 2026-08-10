import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PackagePlus, Save, Trash2 } from 'lucide-react';
import * as challanApi from '../services/challans';
import * as customerApi from '../services/customers';
import * as invApi from '../services/inventory';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import type { Customer, InventoryRow } from '../types';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { formatMoney } from '../utils/format';

interface Line {
  productId: string;
  quantity: string;
}

export function ChallanNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '1' }]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [custRes, invRes] = await Promise.all([
        customerApi.listCustomers({ limit: 100, status: 'ACTIVE' }),
        invApi.listInventory({ limit: 100 }),
      ]);
      setCustomers(custRes.items);
      setInventory(invRes.items);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of inventory) map.set(r.productId, r.quantity);
    return map;
  }, [inventory]);

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: '1' }]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const totalUnits = lines.reduce((acc, l) => acc + (parseInt(l.quantity, 10) || 0), 0);

  async function saveDraft() {
    const items = lines
      .filter((l) => l.productId)
      .map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity, 10) || 0 }))
      .filter((l) => l.quantity > 0);

    if (!customerId) {
      toast.error('Select a customer');
      return;
    }
    if (items.length === 0) {
      toast.error('Add at least one product line with a quantity');
      return;
    }

    setSaving(true);
    try {
      const challan = await challanApi.createChallan({ customerId, items });
      toast.success(`Challan ${challan.challanNumber} saved as draft`);
      navigate(`/challans/${challan.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading products…" />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/challans')} className="mb-1 flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to challans
          </button>
          <h2 className="text-lg font-semibold text-slate-800">New sales challan</h2>
          <p className="text-sm text-slate-500">Created as a draft — stock is only deducted on confirmation.</p>
        </div>
      </div>

      <Card>
        <CardHeader title="1 · Customer" />
        <CardBody>
          <Field label="Customer" required>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName} — {c.name} ({c.customerCode})
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="2 · Products"
          subtitle={`${totalUnits} unit${totalUnits === 1 ? '' : 's'} in total`}
          action={
            <Button size="sm" variant="secondary" onClick={addLine}>
              <PackagePlus className="h-3.5 w-3.5" /> Add line
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {lines.length === 0 ? (
            <EmptyState title="No lines" message="Add a product line to the challan." />
          ) : (
            lines.map((line, idx) => {
              const stock = line.productId ? stockByProduct.get(line.productId) ?? 0 : 0;
              const product = inventory.find((r) => r.productId === line.productId)?.product;
              const requested = parseInt(line.quantity, 10) || 0;
              const insufficient = product ? requested > stock : false;
              return (
                <div key={idx} className="rounded-lg border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                    <Field label={`Product ${idx + 1}`} required>
                      <Select
                        value={line.productId}
                        onChange={(e) => updateLine(idx, { productId: e.target.value })}
                      >
                        <option value="">Select product…</option>
                        {inventory.map((r) => (
                          <option key={r.productId} value={r.productId}>
                            {r.product.sku} — {r.product.name} (stock {r.quantity})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Quantity" required>
                      <Input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        className={insufficient ? 'border-red-400' : ''}
                      />
                    </Field>
                    <button
                      onClick={() => removeLine(idx)}
                      className="mb-1 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {line.productId ? (
                    <p className={`mt-2 text-xs ${insufficient ? 'font-medium text-red-600' : 'text-slate-400'}`}>
                      {product?.name} · {formatMoney(product?.unitPrice ?? 0)}/unit · Available stock: {stock}
                      {insufficient ? ` — only ${stock} in stock, requested ${requested}` : ''}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/challans')}>Cancel</Button>
        <Button onClick={() => void saveDraft()} loading={saving}>
          <Save className="h-4 w-4" /> Save as draft
        </Button>
      </div>
    </div>
  );
}