-- Mini ERP dummy data seed (customers, follow-ups, products, inventory, challans)
BEGIN;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
INSERT INTO customers (id, "customerCode", name, mobile, email, "businessName", "gstNumber", "customerType", status, address, "nextFollowUpDate", notes, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'CUS-A1B2C3', 'Ramesh Sharma', '98765 12345', 'ramesh@sharmaelectricals.in', 'Sharma Electrical Store', '24ABCDE1234F1Z5', 'WHOLESALE', 'ACTIVE', '12, GIDC Phase 2, Vatva, Ahmedabad', '2026-08-14 10:00:00+05:30', 'Bulk buyer — monthly LED & wiring orders. Payment within 15 days.', now(), now()),
  (gen_random_uuid(), 'CUS-D4E5F6', 'Kiran Patel', '98250 44556', 'kiran@patelhardware.in', 'Patel Hardware & Sanitary', '24FGHIJ5678K2M7', 'RETAIL', 'ACTIVE', 'Shop 4, Shreeji Complex, Waghodia Road, Vadodara', '2026-08-12 11:30:00+05:30', 'Walk-in retail counter; likes same-day delivery.', now(), now()),
  (gen_random_uuid(), 'CUS-G7H8J9', 'Anita Desai', '99099 77881', 'anita@greenagro.in', 'Green Agro Traders', '24KLMNO9012L3N9', 'DISTRIBUTOR', 'LEAD', 'Plot 21, Agro Park, Anand', '2026-08-13 16:00:00+05:30', 'New distributor lead — wants drip irrigation & motor pricing.', now(), now()),
  (gen_random_uuid(), 'CUS-K2L3M4', 'Suresh Mehta', '97277 11223', 'suresh@sunrisestore.in', 'Sunrise General Store', NULL, 'RETAIL', 'INACTIVE', 'Main Bazar, Godhra', NULL, 'Seasonal buyer; dormant since May. Reactivate before Diwali.', now(), now()),
  (gen_random_uuid(), 'CUS-P9Q8R7', 'Vijay Solanki', '98980 33445', 'vijay@solankiindustries.in', 'Solanki Industries', '24PQRST3456M4P1', 'WHOLESALE', 'ACTIVE', 'Survey 87, GIDC Naroda, Ahmedabad', '2026-08-18 10:30:00+05:30', 'Factory maintenance stock — motors and heavy wire.', now(), now()),
  (gen_random_uuid(), 'CUS-Z2X5C7', 'Meena Joshi', '99777 55664', 'meena@joshibuilders.in', 'Joshi Builders & Developers', '24UVWXY7890N5R3', 'DISTRIBUTOR', 'LEAD', '2nd Floor, Titan Plaza, Alkapuri, Vadodara', '2026-08-15 14:00:00+05:30', 'Site supply enquiry: PVC pipes for 2 under-construction projects.', now(), now());

-- ---------------------------------------------------------------------------
-- Products + inventory + initial-stock movements
-- ---------------------------------------------------------------------------
WITH p AS (
  INSERT INTO products (id, sku, name, category, "unitPrice", "minimumStock", "warehouseLocation", "isActive", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), 'SKU-ELT-001', 'LED Tube Light 20W', 'Electrical', 249.00, 10, 'Aisle-A1', true, now(), now()),
    (gen_random_uuid(), 'SKU-WIR-002', 'Copper Wire 2.5 sqmm (90m coil)', 'Electrical', 1890.00, 5, 'Aisle-B2', true, now(), now()),
    (gen_random_uuid(), 'SKU-PVC-003', 'PVC Pipe 1 inch (3m)', 'Plumbing', 320.00, 15, 'Aisle-C3', true, now(), now()),
    (gen_random_uuid(), 'SKU-MOT-004', 'Electric Motor 1HP', 'Industrial', 8500.00, 2, 'Aisle-D4', true, now(), now()),
    (gen_random_uuid(), 'SKU-SWT-005', 'Modular Switch 6A (white)', 'Electrical', 95.00, 20, 'Aisle-A2', true, now(), now()),
    (gen_random_uuid(), 'SKU-FAN-006', 'Ceiling Fan 1200mm', 'Electrical', 1450.00, 8, 'Aisle-B1', true, now(), now())
  RETURNING id, sku, name
)
INSERT INTO inventory (id, "productId", quantity, "updatedAt")
SELECT gen_random_uuid(), id, qty, now()
FROM p, (VALUES
  ('SKU-ELT-001', 120),
  ('SKU-WIR-002', 45),
  ('SKU-PVC-003', 200),
  ('SKU-MOT-004', 8),
  ('SKU-SWT-005', 350),
  ('SKU-FAN-006', 60)
) AS v(sku, qty)
WHERE p.sku = v.sku;

-- Audit ledger: every stock entry must have a movement (schema invariant)
INSERT INTO inventory_movements (id, "productId", quantity, "movementType", reason, "createdById")
SELECT gen_random_uuid(), p.id, i.quantity, 'IN', 'Initial stock (seed data)', 'cdd9a9a6-632d-40b0-990c-97ab715673bc'
FROM products p JOIN inventory i ON i."productId" = p.id;

-- ---------------------------------------------------------------------------
-- Customer follow-ups
-- ---------------------------------------------------------------------------
INSERT INTO customer_follow_ups (id, "customerId", "assignedToId", "createdById", "followUpDate", notes, status, "createdAt", "updatedAt")
SELECT gen_random_uuid(), c.id, fu."assignedToId", fu."createdById", fu."followUpDate", fu.notes, fu.status, now(), now()
FROM (VALUES
  ('Sharma Electrical Store', '709df3eb-99bd-4b45-b16a-f287677eade3', 'cdd9a9a6-632d-40b0-990c-97ab715673bc', '2026-08-14 10:00:00+05:30'::timestamp, 'Share quote for 50 LED tubes + 10 copper wire coils; confirm delivery date.', 'PENDING'::"FollowUpStatus"),
  ('Green Agro Traders',      '709df3eb-99bd-4b45-b16a-f287677eade3', 'cdd9a9a6-632d-40b0-990c-97ab715673bc', '2026-08-13 16:00:00+05:30'::timestamp, 'Send motor + drip irrigation catalogue and volume discount slab.', 'PENDING'::"FollowUpStatus"),
  ('Patel Hardware & Sanitary', 'cdd9a9a6-632d-40b0-990c-97ab715673bc', 'cdd9a9a6-632d-40b0-990c-97ab715673bc', '2026-08-09 11:30:00+05:30'::timestamp, 'Delivered PVC sample pieces; discussed shelf display scheme.', 'COMPLETED'::"FollowUpStatus"),
  ('Sunrise General Store',   '709df3eb-99bd-4b45-b16a-f287677eade3', 'cdd9a9a6-632d-40b0-990c-97ab715673bc', '2026-08-05 12:00:00+05:30'::timestamp, 'Called twice — owner out of town; revisit after 15 Aug.', 'CANCELLED'::"FollowUpStatus"),
  ('Joshi Builders & Developers', '709df3eb-99bd-4b45-b16a-f287677eade3', 'cdd9a9a6-632d-40b0-990c-97ab715673bc', '2026-08-15 14:00:00+05:30'::timestamp, 'Site visit booked — measure pipe lengths for both projects.', 'PENDING'::"FollowUpStatus"),
  ('Solanki Industries',      'cdd9a9a6-632d-40b0-990c-97ab715673bc', 'cdd9a9a6-632d-40b0-990c-97ab715673bc', '2026-08-11 10:30:00+05:30'::timestamp, 'MRO order expected monthly; follow up on 2HP motor quote.', 'PENDING'::"FollowUpStatus")
) AS fu("businessName", "assignedToId", "createdById", "followUpDate", notes, status)
JOIN customers c ON c."businessName" = fu."businessName";

-- ---------------------------------------------------------------------------
-- Sales challans + items (snapshots so historical data stays correct)
-- ---------------------------------------------------------------------------
WITH ch AS (
  INSERT INTO sales_challans (id, "challanNumber", "customerId", "totalQuantity", status, "createdById", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), ch."challanNumber", c.id, ch."totalQuantity", ch.status, 'cdd9a9a6-632d-40b0-990c-97ab715673bc', ch."createdAt", ch."createdAt"
  FROM (VALUES
    ('Sharma Electrical Store', 'CH-20260808-7HJ2', 60, 'CONFIRMED'::"ChallanStatus", '2026-08-08 10:15:00+05:30'::timestamp),
    ('Patel Hardware & Sanitary', 'CH-20260809-K3M5', 81, 'CONFIRMED'::"ChallanStatus", '2026-08-09 12:40:00+05:30'::timestamp),
    ('Green Agro Traders', 'CH-20260810-Q2R7', 50, 'DRAFT'::"ChallanStatus", '2026-08-10 15:05:00+05:30'::timestamp),
    ('Sunrise General Store', 'CH-20260805-T9W1', 5, 'CANCELLED'::"ChallanStatus", '2026-08-05 09:30:00+05:30'::timestamp),
    ('Solanki Industries', 'CH-20260811-M4N8', 12, 'DRAFT'::"ChallanStatus", '2026-08-11 09:00:00+05:30'::timestamp)
  ) AS ch("businessName", "challanNumber", "totalQuantity", status, "createdAt")
  JOIN customers c ON c."businessName" = ch."businessName"
  RETURNING id, "challanNumber"
)
INSERT INTO sales_challan_items (id, "challanId", "productId", "productNameSnapshot", "skuSnapshot", "unitPriceSnapshot", quantity)
SELECT gen_random_uuid(), ch.id, p.id, p.name, p.sku, p."unitPrice", it.qty
FROM ch
JOIN (VALUES
  ('CH-20260808-7HJ2', 'SKU-ELT-001', 50),
  ('CH-20260808-7HJ2', 'SKU-WIR-002', 10),
  ('CH-20260809-K3M5', 'SKU-PVC-003', 80),
  ('CH-20260809-K3M5', 'SKU-MOT-004', 1),
  ('CH-20260810-Q2R7', 'SKU-ELT-001', 20),
  ('CH-20260810-Q2R7', 'SKU-PVC-003', 30),
  ('CH-20260805-T9W1', 'SKU-WIR-002', 5),
  ('CH-20260811-M4N8', 'SKU-FAN-006', 12)
) AS it("challanNumber", sku, qty) ON it."challanNumber" = ch."challanNumber"
JOIN products p ON p.sku = it.sku;

COMMIT;

-- Verify
SELECT 'customers' AS tbl, count(*) FROM customers
UNION ALL SELECT 'follow_ups', count(*) FROM customer_follow_ups
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'inventory', count(*) FROM inventory
UNION ALL SELECT 'movements', count(*) FROM inventory_movements
UNION ALL SELECT 'challans', count(*) FROM sales_challans
UNION ALL SELECT 'challan_items', count(*) FROM sales_challan_items;
