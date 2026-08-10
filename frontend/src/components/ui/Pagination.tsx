import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onChange }: PaginationProps) {
  if (totalPages <= 1) {
    return <p className="text-xs text-slate-400">{total} record{total === 1 ? '' : 's'}</p>;
  }
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-slate-400">
        Page {page} of {totalPages} · {total} records
      </p>
      <div className="flex items-center gap-1">
        <button
          className="rounded border border-slate-300 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="rounded border border-slate-300 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function TableShell({ headers, children, colSpan }: { headers: string[]; children: ReactNode; colSpan?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {colSpan && <TablePagerSpacer colSpan={colSpan} />}
    </div>
  );
}

function TablePagerSpacer({ colSpan }: { colSpan: number }) {
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        <tr className="invisible">
          <td colSpan={colSpan}>.</td>
        </tr>
      </tbody>
    </table>
  );
}