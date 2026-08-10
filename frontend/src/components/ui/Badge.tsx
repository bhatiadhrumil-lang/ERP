import type { ReactNode } from 'react';

type Tone = 'gray' | 'indigo' | 'emerald' | 'amber' | 'red' | 'sky';

const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600',
  indigo: 'bg-indigo-50 text-indigo-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  sky: 'bg-sky-50 text-sky-700',
};

export function Badge({ tone = 'gray', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function CustomerStatusBadge({ status }: { status: string }) {
  const tone = status === 'ACTIVE' ? 'emerald' : status === 'INACTIVE' ? 'gray' : 'amber';
  return <Badge tone={tone}>{status.toLowerCase()}</Badge>;
}

export function FollowUpStatusBadge({ status }: { status: string }) {
  const tone = status === 'PENDING' ? 'amber' : status === 'COMPLETED' ? 'emerald' : 'gray';
  return <Badge tone={tone}>{status.toLowerCase()}</Badge>;
}

export function ChallanStatusBadge({ status }: { status: string }) {
  const tone = status === 'CONFIRMED' ? 'emerald' : status === 'DRAFT' ? 'sky' : 'gray';
  return <Badge tone={tone}>{status.toLowerCase()}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  const tone =
    role === 'ADMIN' ? 'red' : role === 'SALES' ? 'indigo' : role === 'WAREHOUSE' ? 'amber' : 'sky';
  return <Badge tone={tone}>{role}</Badge>;
}

export function MovementBadge({ type }: { type: string }) {
  return <Badge tone={type === 'IN' ? 'emerald' : 'red'}>{type === 'IN' ? 'IN' : 'OUT'}</Badge>;
}

export function StockStatusBadge({ status }: { status: string }) {
  const tone = status === 'OK' ? 'emerald' : status === 'LOW' ? 'amber' : 'red';
  const label = status === 'OK' ? 'In stock' : status === 'LOW' ? 'Low stock' : 'Out of stock';
  return <Badge tone={tone}>{label}</Badge>;
}