import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  Clock,
  FileText,
  Package,
  PhoneCall,
  ShoppingCart,
  Users,
} from 'lucide-react';
import * as dashApi from '../services/dashboard';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import type { DashboardSummary, LowStockItem, RecentActivityItem } from '../types';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Spinner, ErrorState } from '../components/ui/Feedback';
import { ChallanStatusBadge, MovementBadge } from '../components/ui/Badge';
import { formatDateTime } from '../utils/format';

export function DashboardPage() {
  const toast = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, l, a] = await Promise.all([dashApi.getSummary(), dashApi.getLowStock(), dashApi.getRecentActivity()]);
      setSummary(s);
      setLowStock(l);
      setActivity(a);
    } catch (err) {
      setError(apiErrorMessage(err));
      toast.error(apiErrorMessage(err));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !summary) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!summary) return <Spinner label="Loading dashboard…" />;

  const metrics: { label: string; value: number | string; icon: typeof Users; tone: string; to?: string }[] = [
    { label: 'Total customers', value: summary.totalCustomers, icon: Users, tone: 'text-indigo-600 bg-indigo-50', to: '/customers' },
    { label: 'Active customers', value: summary.activeCustomers, icon: Building2, tone: 'text-emerald-600 bg-emerald-50', to: '/customers' },
    { label: 'Products', value: summary.totalProducts, icon: Package, tone: 'text-sky-600 bg-sky-50', to: '/products' },
    {
      label: 'Low stock',
      value: summary.lowStockProducts,
      icon: AlertTriangle,
      tone: summary.lowStockProducts > 0 ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50',
      to: '/inventory',
    },
    { label: 'Pending follow-ups', value: summary.pendingFollowUps, icon: PhoneCall, tone: 'text-violet-600 bg-violet-50', to: '/followups' },
    { label: 'Draft challans', value: summary.draftChallans, icon: FileText, tone: 'text-sky-600 bg-sky-50', to: '/challans' },
    { label: 'Confirmed challans', value: summary.confirmedChallans, icon: ShoppingCart, tone: 'text-emerald-600 bg-emerald-50', to: '/challans' },
    { label: 'Cancelled challans', value: summary.cancelledChallans, icon: Clock, tone: 'text-slate-600 bg-slate-100', to: '/challans' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.label} to={m.to ?? '#'} className={m.to ? '' : 'pointer-events-none'}>
              <Card className="transition-shadow hover:shadow-md">
                <CardBody className="flex items-center gap-4">
                  <div className={`rounded-xl p-3 ${m.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{m.value}</p>
                    <p className="text-xs text-slate-500">{m.label}</p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Low stock */}
        <Card>
          <CardHeader title="Low stock alerts" subtitle="Products at or below minimum stock" />
          <CardBody className="p-0">
            {lowStock.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">All products are sufficiently stocked.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowStock.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {p.sku} · {p.category} · {p.warehouseLocation}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${p.quantity === 0 ? 'text-red-600' : 'text-amber-600'}`}>{p.quantity} left</p>
                      <p className="text-[11px] text-slate-400">min {p.minimumStock}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Recent activity */}
        <Card className="xl:col-span-2">
          <CardHeader title="Recent activity" subtitle="Latest inventory movements and challan events" />
          <CardBody className="p-0">
            {activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((a) => {
                  const isIn = a.type === 'MOVEMENT' && a.movementType === 'IN';
                  const isOut = a.type === 'MOVEMENT' && a.movementType === 'OUT';
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <div
                        className={`rounded-lg p-2 ${
                          isIn
                            ? 'bg-emerald-50 text-emerald-600'
                            : isOut
                              ? 'bg-red-50 text-red-600'
                              : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {isIn ? <ArrowDownToLine className="h-4 w-4" /> : isOut ? <ArrowUpFromLine className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-700">{a.title}</p>
                        <p className="truncate text-xs text-slate-400">
                          {a.detail} · {formatDateTime(a.createdAt)}
                        </p>
                      </div>
                      {a.type === 'CHALLAN' ? <ChallanStatusBadge status={a.status ?? 'DRAFT'} /> : <MovementBadge type={a.movementType ?? 'IN'} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}