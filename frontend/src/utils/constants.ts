import type { UserRole } from '../types';

export interface NavItem {
  label: string;
  to: string;
  icon: string;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: 'layout-dashboard', roles: ['ADMIN', 'SALES', 'ACCOUNTS'] },
  { label: 'Customers', to: '/customers', icon: 'users', roles: ['ADMIN', 'SALES', 'ACCOUNTS'] },
  { label: 'Follow-ups', to: '/followups', icon: 'phone-call', roles: ['ADMIN', 'SALES'] },
  { label: 'Products', to: '/products', icon: 'package', roles: ['ADMIN', 'SALES', 'WAREHOUSE'] },
  { label: 'Inventory', to: '/inventory', icon: 'boxes', roles: ['ADMIN', 'SALES', 'WAREHOUSE'] },
  { label: 'Challans', to: '/challans', icon: 'file-text', roles: ['ADMIN', 'SALES', 'ACCOUNTS'] },
  { label: 'Users', to: '/users', icon: 'shield', roles: ['ADMIN'] },
];

export const can = (role: UserRole | undefined, ...roles: UserRole[]): boolean =>
  !!role && (roles.includes(role) || roles.includes('ADMIN'));

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  SALES: 'Sales',
  WAREHOUSE: 'Warehouse',
  ACCOUNTS: 'Accounts',
};

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  DISTRIBUTOR: 'Distributor',
};

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  LEAD: 'Lead',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

export const FOLLOWUP_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const CHALLAN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: 'In',
  OUT: 'Out',
};

export const DEV_LOGIN_ACCOUNTS = [
  { email: 'admin@mini-erp.local', label: 'Admin User' },
  { email: 'sales@mini-erp.local', label: 'Rohan Verma (Sales)' },
  { email: 'warehouse@mini-erp.local', label: 'Imran Shaikh (Warehouse)' },
  { email: 'accounts@mini-erp.local', label: 'Priya Nair (Accounts)' },
] as const;