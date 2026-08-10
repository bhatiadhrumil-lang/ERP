import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input, Select } from './Field';

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-56 pl-8" />
    </div>
  );
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'All',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as T)} className="w-40">
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}