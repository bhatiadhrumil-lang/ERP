import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Building2, CheckCircle2, FileText, User } from 'lucide-react';
import * as challanApi from '../services/challans';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Challan } from '../types';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ChallanStatusBadge } from '../components/ui/Badge';
import { ErrorState, Spinner } from '../components/ui/Feedback';
import { CHALLAN_STATUS_LABELS, can } from '../utils/constants';
import { formatDateTime, formatMoney } from '../utils/format';

export function ChallanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [challan, setChallan] = useState<Challan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'confirm' | 'cancel' | null>(null);
  const [acting, setActing] = useState(false);

  const canAct = can(user?.role, 'ADMIN', 'SALES');

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setChallan(await challanApi.getChallan(id));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmChallan() {
    if (!challan) return;
    setActing(true);
    try {
      const updated = await challanApi.confirmChallan(challan.id);
      setChallan(updated);
      toast.success(`Challan ${updated.challanNumber} confirmed — inventory deducted`);
      setDialog(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  async function cancelChallan() {
    if (!challan) return;
    setActing(true);
    try {
      const updated = await challanApi.cancelChallan(challan.id);
      setChallan(updated);
      toast.success(
        updated.status === 'CANCELLED' && challan.status === 'CONFIRMED'
          ? `Challan cancelled — stock restored to inventory`
          : 'Challan cancelled',
      );
      setDialog(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  if (error && !challan) return <ErrorState message={error} />;
  if (!challan) return <Spinner label="Loading challan…" />;

  const totalValue = (challan.items ?? []).reduce(
    (acc, item) => acc + item.quantity * parseFloat(item.unitPriceSnapshot),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/challans')} className="mb-1 flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to challans
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800">{challan.challanNumber}</h2>
            <ChallanStatusBadge status={challan.status} />
          </div>
          <p className="text-sm text-slate-500">Created {formatDateTime(challan.createdAt)}</p>
        </div>
        {canAct && challan.status === 'DRAFT' ? (
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setDialog('cancel')}>
              <Ban className="h-4 w-4" /> Cancel
            </Button>
            <Button variant="success" onClick={() => setDialog('confirm')}>
              <CheckCircle2 className="h-4 w-4" /> Confirm challan
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card>
          <CardHeader title="Customer" />
          <CardBody className="space-y-2 text-sm">
            {challan.customer ? (
              <>
                <Link to={`/customers/${challan.customer.id}`} className="flex items-center gap-2 font-medium text-indigo-600 hover:underline">
                  <Building2 className="h-4 w-4 text-slate-400" /> {challan.customer.name}
                </Link>
                <p className="text-xs text-slate-500">{challan.customer.businessName} · {challan.customer.customerCode}</p>
              </>
            ) : (
              <p className="text-slate-500">—</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Summary" />
          <CardBody className="space-y-1 text-sm">
            <p className="flex items-center justify-between text-slate-600">
              <span>Total units</span> <strong className="text-slate-800">{challan.totalQuantity}</strong>
            </p>
            <p className="flex items-center justify-between text-slate-600">
              <span>Snapshot value</span> <strong className="text-slate-800">{formatMoney(totalValue)}</strong>
            </p>
            <p className="flex items-center justify-between text-slate-600">
              <span>Status</span> <span>{CHALLAN_STATUS_LABELS[challan.status]}</span>
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Created by" />
          <CardBody className="text-sm">
            <p className="flex items-center gap-2 text-slate-700">
              <User className="h-4 w-4 text-slate-400" /> {challan.createdBy?.name ?? '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Last updated {formatDateTime(challan.updatedAt)}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Items" subtitle="Snapshots taken at challan creation — safe from later product edits" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">SKU</th>
                  <th className="px-4 py-2.5 font-semibold">Qty</th>
                  <th className="px-4 py-2.5 font-semibold">Snapshot price</th>
                  <th className="px-4 py-2.5 font-semibold">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(challan.items ?? []).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.productNameSnapshot}</td>
                    <td className="px-4 py-3 text-slate-500">{item.skuSnapshot}</td>
                    <td className="px-4 py-3 text-slate-700">{item.quantity}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMoney(item.unitPriceSnapshot)}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatMoney(parseFloat(item.unitPriceSnapshot) * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {challan.status === 'DRAFT' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <FileText className="mr-1 inline h-3.5 w-3.5" />
          This challan is a draft. Confirming it atomically deducts stock and writes OUT movements to the inventory ledger.
        </p>
      ) : null}

      <ConfirmDialog
        open={dialog === 'confirm'}
        title="Confirm challan"
        message={`Confirm ${challan.challanNumber}? Inventory for all ${challan.totalQuantity} units will be deducted atomically and OUT movements recorded.`}
        confirmLabel="Confirm challan"
        loading={acting}
        onConfirm={() => void confirmChallan()}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        title="Cancel challan"
        message={
          challan.status === 'CONFIRMED'
            ? `Cancel ${challan.challanNumber}? Its ${challan.totalQuantity} units will be returned to inventory with IN movements.`
            : `Cancel draft ${challan.challanNumber}? Draft items are discarded, stock is unaffected.`
        }
        confirmLabel="Cancel challan"
        danger
        loading={acting}
        onConfirm={() => void cancelChallan()}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}