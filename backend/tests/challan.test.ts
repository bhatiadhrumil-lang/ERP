import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { ApiError, ErrorCodes } from '../src/utils/ApiError';
import {
  createChallan,
  confirmChallan,
  cancelChallan,
  updateChallan,
} from '../src/services/challan.service';
import { adjustStock } from '../src/services/inventory.service';
import { resetDb, createUser, createProduct, createCustomer, inventoryQuantity, movementCount } from './helpers';

/**
 * The critical business rules (spec sections 18-19):
 *  1. Confirming a DRAFT challan is ONE atomic transaction:
 *     stock decreases, OUT movement is created, status flips to CONFIRMED.
 *  2. Any shortage → full rollback: no stock change, no movements, still DRAFT.
 *  3. Cancelling a CONFIRMED challan restores stock via compensating IN movements.
 */
describe('Sales challan lifecycle (service level)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('confirms a challan atomically: stock 100 -> 80, OUT 20 movement, CONFIRMED', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Atomic Buyer');
    const product = await createProduct('SKU-ATOMIC-1', 100);

    const challan = await createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 20 }] },
      sales.id,
    );
    expect(challan.status).toBe('DRAFT');

    const confirmed = await confirmChallan(challan.id, sales.id);

    expect(confirmed.status).toBe('CONFIRMED');
    expect(await inventoryQuantity(product.id)).toBe(80);

    const movement = await prisma.inventoryMovement.findFirst({
      where: { productId: product.id, movementType: 'OUT' },
    });
    expect(movement).not.toBeNull();
    expect(movement!.quantity).toBe(20);
    expect(movement!.reason).toContain(challan.challanNumber);
    expect(movement!.createdById).toBe(sales.id);
  });

  it('rejects a draft whose requested quantity exceeds stock — nothing changes', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Over Buyer');
    const product = await createProduct('SKU-OVER-1', 100);

    await expect(
      createChallan({ customerId: customer.id, items: [{ productId: product.id, quantity: 120 }] }, sales.id),
    ).rejects.toMatchObject({ code: ErrorCodes.INSUFFICIENT_STOCK });

    expect(await inventoryQuantity(product.id)).toBe(100);
    expect(await movementCount(product.id)).toBe(0);
    expect(await prisma.salesChallan.count()).toBe(0);
  });

  it('rejects confirmation when stock ran out after draft — full rollback, no partial updates', async () => {
    const warehouse = await createUser('WAREHOUSE', { name: 'Warehouse' });
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Shrinking Buyer');
    const product = await createProduct('SKU-SHRINK-1', 100);

    // Draft for 60 (stock 100 is fine at draft time)
    const challan = await createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 60 }] },
      sales.id,
    );

    // Stock drops to 50 before anyone confirms
    await adjustStock(product.id, { movementType: 'OUT', quantity: 50, reason: 'Another order' }, warehouse.id);

    await expect(confirmChallan(challan.id, sales.id)).rejects.toMatchObject({
      code: ErrorCodes.INSUFFICIENT_STOCK,
    });

    // Rollback guarantees: inventory untouched at 50, no OUT movement for the
    // challan, challan still DRAFT.
    expect(await inventoryQuantity(product.id)).toBe(50);
    const outMovements = await prisma.inventoryMovement.findMany({
      where: { productId: product.id, movementType: 'OUT' },
    });
    const challanOut = outMovements.filter((m) => m.reason.includes(challan.challanNumber));
    expect(challanOut).toHaveLength(0);
    const challanNow = await prisma.salesChallan.findUnique({ where: { id: challan.id } });
    expect(challanNow!.status).toBe('DRAFT');
  });

  it('stores product snapshots that survive later product-master changes', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Snapshot Buyer');
    const product = await createProduct('SKU-SNAP-1', 50);

    const challan = await createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 4 }] },
      sales.id,
    );
    const item = challan.items[0];
    expect(item.productNameSnapshot).toBe(`Product SKU-SNAP-1`);
    expect(item.skuSnapshot).toBe('SKU-SNAP-1');
    expect(Number(item.unitPriceSnapshot)).toBe(100);

    // Mutate the product master after the challan exists
    await prisma.product.update({
      where: { id: product.id },
      data: { name: 'Renamed Product', unitPrice: 999.99 },
    });

    const stored = await prisma.salesChallanItem.findUnique({ where: { id: item.id } });
    expect(stored!.productNameSnapshot).toBe(`Product SKU-SNAP-1`);
    expect(stored!.skuSnapshot).toBe('SKU-SNAP-1');
    expect(Number(stored!.unitPriceSnapshot)).toBe(100);
  });

  it('rejects confirming twice and confirming a cancelled challan', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Twice Buyer');
    const product = await createProduct('SKU-TWICE-1', 30);

    const challan = await createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 5 }] },
      sales.id,
    );
    await confirmChallan(challan.id, sales.id);

    await expect(confirmChallan(challan.id, sales.id)).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });

    await cancelChallan(challan.id, sales.id);
    await expect(confirmChallan(challan.id, sales.id)).rejects.toMatchObject({
      code: ErrorCodes.CONFLICT,
    });
  });

  it('cancels a DRAFT without touching stock', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Draft Buyer');
    const product = await createProduct('SKU-DRAFT-1', 25);

    const challan = await createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 7 }] },
      sales.id,
    );
    await cancelChallan(challan.id, sales.id);

    expect((await prisma.salesChallan.findUnique({ where: { id: challan.id } }))!.status).toBe('CANCELLED');
    expect(await inventoryQuantity(product.id)).toBe(25);
    expect(await movementCount(product.id)).toBe(0);
  });

  it('cancels a CONFIRMED challan and restores stock via a compensating IN movement', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Restock Buyer');
    const product = await createProduct('SKU-RESTOCK-1', 100);

    const challan = await createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 20 }] },
      sales.id,
    );
    await confirmChallan(challan.id, sales.id);
    expect(await inventoryQuantity(product.id)).toBe(80);

    await cancelChallan(challan.id, sales.id);

    expect((await prisma.salesChallan.findUnique({ where: { id: challan.id } }))!.status).toBe('CANCELLED');
    expect(await inventoryQuantity(product.id)).toBe(100);

    const restock = await prisma.inventoryMovement.findFirst({
      where: { productId: product.id, movementType: 'IN', reason: { contains: challan.challanNumber } },
    });
    expect(restock).not.toBeNull();
    expect(restock!.quantity).toBe(20);
  });

  it('edits a DRAFT (quantities + snapshots refresh); refuses edits after confirm', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const customer = await createCustomer('Editor');
    const product = await createProduct('SKU-EDIT-1', 50);

    const challan = await createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 20 }] },
      sales.id,
    );

    const updated = await updateChallan(
      challan.id,
      { items: [{ productId: product.id, quantity: 10 }] },
    );
    expect(updated.totalQuantity).toBe(10);
    expect(updated.status).toBe('DRAFT');

    await confirmChallan(challan.id, sales.id);
    expect(await inventoryQuantity(product.id)).toBe(40);

    await expect(updateChallan(challan.id, { items: [{ productId: product.id, quantity: 2 }] }))
      .rejects.toMatchObject({ code: ErrorCodes.CONFLICT });
  });

  it('rejects confirmation of a nonexistent challan with NOT_FOUND', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    await expect(
      confirmChallan('00000000-0000-4000-8000-000000000000', sales.id),
    ).rejects.toMatchObject({ code: ErrorCodes.NOT_FOUND });
  });
});