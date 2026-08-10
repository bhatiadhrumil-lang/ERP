/**
 * Development seed data — idempotent (safe to re-run).
 *
 * IMPORTANT: all users below are DEVELOPMENT/TEST users keyed to placeholder
 * Cognito sub values. In production each user is provisioned in AWS Cognito
 * and mapped here via their real cognitoSub. No passwords exist anywhere —
 * Cognito owns credentials.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ------------------------------------------------------------------
  // Users (development/test users — placeholder cognitoSub values)
  // ------------------------------------------------------------------
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@mini-erp.local' },
    update: {},
    create: {
      cognitoSub: 'dev-sub-admin-0001',
      name: 'Admin User',
      email: 'admin@mini-erp.local',
      role: 'ADMIN',
    },
  });

  const salesUser = await prisma.user.upsert({
    where: { email: 'sales@mini-erp.local' },
    update: {},
    create: {
      cognitoSub: 'dev-sub-sales-0001',
      name: 'Rohan Verma',
      email: 'sales@mini-erp.local',
      role: 'SALES',
    },
  });

  const warehouseUser = await prisma.user.upsert({
    where: { email: 'warehouse@mini-erp.local' },
    update: {},
    create: {
      cognitoSub: 'dev-sub-warehouse-0001',
      name: 'Imran Shaikh',
      email: 'warehouse@mini-erp.local',
      role: 'WAREHOUSE',
    },
  });

  await prisma.user.upsert({
    where: { email: 'accounts@mini-erp.local' },
    update: {},
    create: {
      cognitoSub: 'dev-sub-accounts-0001',
      name: 'Priya Nair',
      email: 'accounts@mini-erp.local',
      role: 'ACCOUNTS',
    },
  });

  // ------------------------------------------------------------------
  // Customers (CRM)
  // ------------------------------------------------------------------
  const daysFromNow = (days: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  };

  interface SeedCustomer {
    customerCode: string;
    name: string;
    mobile: string;
    email?: string;
    businessName: string;
    gstNumber?: string;
    customerType: 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR';
    status: 'LEAD' | 'ACTIVE' | 'INACTIVE';
    address?: string;
    nextFollowUpDate?: Date;
    notes?: string;
  }

  const customerData: SeedCustomer[] = [
    {
      customerCode: 'CUS-SEED-01',
      name: 'Arun Sharma',
      mobile: '+91 98110 12345',
      email: 'arun@sharmaelectricals.in',
      businessName: 'Sharma Electricals',
      gstNumber: '06AAACS1234F1Z2',
      customerType: 'WHOLESALE',
      status: 'ACTIVE',
      address: 'Plot 14, Sector 18, Gurugram, Haryana',
      nextFollowUpDate: daysFromNow(3),
      notes: 'Bulk consumer of copper wire and MCBs. Prefers delivery on Fridays.',
    },
    {
      customerCode: 'CUS-SEED-02',
      name: 'Sanjay Gupta',
      mobile: '+91 98220 23456',
      email: 'sanjay@guptahardware.in',
      businessName: 'Gupta Hardware Store',
      gstNumber: '07AAGPG5678K1Z3',
      customerType: 'RETAIL',
      status: 'ACTIVE',
      address: 'Shop 21, Chawri Bazar, New Delhi',
      notes: 'Walk-in retail. Orders small quantities weekly.',
    },
    {
      customerCode: 'CUS-SEED-03',
      name: 'Vikram Mehta',
      mobile: '+91 98330 34567',
      email: 'vikram@mehtatraders.in',
      businessName: 'Mehta Traders',
      gstNumber: '08AAGPM9012L1Z4',
      customerType: 'DISTRIBUTOR',
      status: 'ACTIVE',
      address: '22 Godown Road, Jaipur, Rajasthan',
      nextFollowUpDate: daysFromNow(7),
      notes: 'Distributes power tools across Rajasthan.',
    },
    {
      customerCode: 'CUS-SEED-04',
      name: 'Rakesh Jain',
      mobile: '+91 98440 45678',
      email: 'rakesh@jainelectrics.in',
      businessName: 'Jain Electrics',
      gstNumber: '27AAFCJ3456M1Z5',
      customerType: 'RETAIL',
      status: 'LEAD',
      address: 'Station Road, Mumbai, Maharashtra',
      nextFollowUpDate: daysFromNow(1),
      notes: 'New lead from trade show. Interested in LED and MCB lines.',
    },
    {
      customerCode: 'CUS-SEED-05',
      name: 'Bharat Patel',
      mobile: '+91 98550 56789',
      email: 'bharat@pateldistributors.in',
      businessName: 'Patel Distributors',
      gstNumber: '24AAGPP7890N1Z6',
      customerType: 'DISTRIBUTOR',
      status: 'INACTIVE',
      address: 'GIDC Estate, Ahmedabad, Gujarat',
      notes: 'Paused account — revisit end of quarter.',
    },
    {
      customerCode: 'CUS-SEED-06',
      name: 'Harpreet Singh',
      mobile: '+91 98660 67890',
      email: 'harpreet@singhbuilders.in',
      businessName: 'Singh Builders & Co.',
      gstNumber: '04AAGCS2345P1Z7',
      customerType: 'WHOLESALE',
      status: 'ACTIVE',
      address: 'Sector 22-C, Chandigarh',
      nextFollowUpDate: daysFromNow(5),
      notes: 'Regular PVC pipe and fittings buyer for construction projects.',
    },
  ];

  // ------------------------------------------------------------------
  // Customers upsert (map of customerCode -> id used by follow-ups)
  // ------------------------------------------------------------------
  const customers: Record<string, string> = {};
  for (const c of customerData) {
    const record = await prisma.customer.upsert({
      where: { customerCode: c.customerCode },
      update: {},
      create: {
        customerCode: c.customerCode,
        name: c.name,
        mobile: c.mobile,
        email: c.email ?? null,
        businessName: c.businessName,
        gstNumber: c.gstNumber ?? null,
        customerType: c.customerType,
        status: c.status,
        address: c.address ?? null,
        nextFollowUpDate: c.nextFollowUpDate ?? null,
        notes: c.notes ?? null,
      },
    });
    customers[c.customerCode] = record.id;
  }

  interface SeedProduct {
    sku: string;
    name: string;
    category: string;
    unitPrice: string;
    minimumStock: number;
    warehouseLocation: string;
    quantity: number;
  }

  const productData: SeedProduct[] = [
    { sku: 'SKU-EL-001', name: 'Copper Wire 1.5mm (90m Coil)', category: 'Electrical', unitPrice: '2450.00', minimumStock: 10, warehouseLocation: 'Aisle-A1', quantity: 60 },
    { sku: 'SKU-EL-002', name: 'PVC Insulation Tape (Pack of 12)', category: 'Electrical', unitPrice: '180.00', minimumStock: 50, warehouseLocation: 'Aisle-A2', quantity: 240 },
    { sku: 'SKU-EL-003', name: 'LED Bulb 9W (Box of 10)', category: 'Electrical', unitPrice: '620.00', minimumStock: 30, warehouseLocation: 'Aisle-A3', quantity: 85 },
    { sku: 'SKU-EL-004', name: 'MCB 16A Single Pole', category: 'Electrical', unitPrice: '310.00', minimumStock: 25, warehouseLocation: 'Aisle-B1', quantity: 42 },
    { sku: 'SKU-PL-001', name: 'PVC Pipe 2-inch (3m)', category: 'Plumbing', unitPrice: '540.00', minimumStock: 20, warehouseLocation: 'Aisle-C1', quantity: 35 },
    { sku: 'SKU-PL-002', name: 'Brass Ball Valve 1-inch', category: 'Plumbing', unitPrice: '890.00', minimumStock: 15, warehouseLocation: 'Aisle-C2', quantity: 18 },
    { sku: 'SKU-PL-003', name: 'CPVC Elbow 1/2-inch (Bag of 50)', category: 'Plumbing', unitPrice: '460.00', minimumStock: 40, warehouseLocation: 'Aisle-C3', quantity: 120 },
    { sku: 'SKU-HW-001', name: 'Allen Key Set (9-piece)', category: 'Hardware', unitPrice: '350.00', minimumStock: 30, warehouseLocation: 'Aisle-D1', quantity: 64 },
    { sku: 'SKU-HW-002', name: 'HSS Drill Bit Set (13-piece)', category: 'Hardware', unitPrice: '1150.00', minimumStock: 12, warehouseLocation: 'Aisle-D2', quantity: 26 },
    { sku: 'SKU-HW-003', name: 'Padlock 40mm Heavy Duty', category: 'Hardware', unitPrice: '275.00', minimumStock: 40, warehouseLocation: 'Aisle-D3', quantity: 9 },
    { sku: 'SKU-PT-001', name: 'Cordless Drill 18V', category: 'Power Tools', unitPrice: '7200.00', minimumStock: 4, warehouseLocation: 'Aisle-E1', quantity: 6 },
    { sku: 'SKU-PT-002', name: 'Angle Grinder 750W', category: 'Power Tools', unitPrice: '3400.00', minimumStock: 5, warehouseLocation: 'Aisle-E2', quantity: 3 },
  ];

  const productIds: Record<string, string> = {};
  for (const p of productData) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        category: p.category,
        unitPrice: new Prisma.Decimal(p.unitPrice),
        minimumStock: p.minimumStock,
        warehouseLocation: p.warehouseLocation,
        inventory: { create: { quantity: p.quantity } },
      },
    });
    productIds[p.sku] = product.id;
  }

  // Initial IN movements — only when the ledger is empty (idempotent).
  const movementCount = await prisma.inventoryMovement.count();
  if (movementCount === 0) {
    await prisma.inventoryMovement.createMany({
      data: productData.map((p) => ({
        productId: productIds[p.sku]!,
        quantity: p.quantity,
        movementType: 'IN',
        reason: 'Initial stock (development seed)',
        createdById: warehouseUser.id,
      })),
    });
  }

  // ------------------------------------------------------------------
  // Customer follow-ups (pending / completed / cancelled examples)
  // ------------------------------------------------------------------
  const followUpCount = await prisma.customerFollowUp.count();
  if (followUpCount === 0) {
    const pastDays = (days: number): Date => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d;
    };

    await prisma.customerFollowUp.createMany({
      data: [
        {
          customerId: customers['CUS-SEED-01']!,
          assignedToId: salesUser.id,
          createdById: salesUser.id,
          followUpDate: daysFromNow(3),
          notes: 'Confirm Friday delivery slot and reorder of MCB 16A.',
          status: 'PENDING',
        },
        {
          customerId: customers['CUS-SEED-04']!,
          assignedToId: salesUser.id,
          createdById: salesUser.id,
          followUpDate: daysFromNow(1),
          notes: 'Share LED + MCB catalogue and quote for 500-unit order.',
          status: 'PENDING',
        },
        {
          customerId: customers['CUS-SEED-03']!,
          assignedToId: salesUser.id,
          createdById: salesUser.id,
          followUpDate: pastDays(2),
          notes: 'Discussed distributor pricing for power tools.',
          status: 'COMPLETED',
        },
        {
          customerId: customers['CUS-SEED-02']!,
          assignedToId: salesUser.id,
          createdById: salesUser.id,
          followUpDate: pastDays(5),
          notes: 'Customer postponed — will call back after Diwali stock-up.',
          status: 'CANCELLED',
        },
      ],
    });
  }

  void adminUser;
  // eslint-disable-next-line no-console
  console.log('Seed complete:');
  // eslint-disable-next-line no-console
  console.log(`  users: admin@mini-erp.local, sales@mini-erp.local, warehouse@mini-erp.local, accounts@mini-erp.local`);
  // eslint-disable-next-line no-console
  console.log(`  customers: ${customerData.length}, products: ${productData.length}, inventory movements: ${movementCount === 0 ? productData.length : 'existing'}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });