// API domain types — mirror the backend response envelopes.

export type UserRole = 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTS';
export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR';
export type CustomerStatus = 'LEAD' | 'ACTIVE' | 'INACTIVE';
export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
export type MovementType = 'IN' | 'OUT';
export type ChallanStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type StockStatus = 'OK' | 'LOW' | 'OUT';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  customerCode: string;
  name: string;
  mobile: string;
  email: string | null;
  businessName: string;
  gstNumber: string | null;
  customerType: CustomerType;
  status: CustomerStatus;
  address: string | null;
  nextFollowUpDate: string | null;
  notes: string | null;
  createdAt: string;
  _count?: { followUps: number; salesChallans: number };
}

export interface FollowUp {
  id: string;
  customerId: string;
  followUpDate: string;
  notes: string;
  status: FollowUpStatus;
  createdAt: string;
  customer?: { id: string; name: string; customerCode: string; businessName: string };
  assignedTo?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unitPrice: string;
  minimumStock: number;
  warehouseLocation: string;
  isActive: boolean;
  createdAt: string;
  inventory?: { quantity: number; updatedAt: string } | null;
}

export interface InventoryRow {
  id: string;
  productId: string;
  quantity: number;
  updatedAt: string;
  stockStatus?: StockStatus;
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    unitPrice: string;
    minimumStock: number;
    warehouseLocation: string;
    isActive: boolean;
  };
}

export interface Movement {
  id: string;
  productId: string;
  quantity: number;
  movementType: MovementType;
  reason: string;
  createdAt: string;
  product?: { name: string; sku: string };
  createdBy?: { name: string } | null;
}

export interface ChallanItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  unitPriceSnapshot: string;
  quantity: number;
  createdAt: string;
}

export interface Challan {
  id: string;
  challanNumber: string;
  customerId: string;
  totalQuantity: number;
  status: ChallanStatus;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string; customerCode: string; businessName: string };
  createdBy?: { id: string; name: string } | null;
  items?: ChallanItem[];
}

export interface DashboardSummary {
  totalCustomers: number;
  activeCustomers: number;
  totalProducts: number;
  lowStockProducts: number;
  pendingFollowUps: number;
  draftChallans: number;
  confirmedChallans: number;
  cancelledChallans: number;
}

export interface LowStockItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  minimumStock: number;
  warehouseLocation: string;
  quantity: number;
}

export interface RecentActivityItem {
  id: string;
  type: 'MOVEMENT' | 'CHALLAN';
  title: string;
  detail: string;
  createdAt: string;
  movementType?: MovementType;
  status?: ChallanStatus;
}

export interface AuthSession {
  token: string;
  user: User;
}