const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { pool } = require("../db");
const { jwtSecret } = require("../config");

// สร้าง token ไว้ใช้ในเทสต์
const customerToken = jwt.sign({ id: 2, role: "customer" }, jwtSecret);
const adminToken = jwt.sign({ id: 1, role: "admin" }, jwtSecret);
const fakeToken = jwt.sign({ id: 1, role: "admin" }, "wrong-secret"); // เซ็นด้วย secret ผิด

// ฟังก์ชันช่วยสร้างออเดอร์ (ลดโค้ดซ้ำ)
function createOrder(body, token = customerToken) {
  return request(app)
    .post("/orders")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

afterAll(async () => {
  // ลบออเดอร์ที่เทสต์สร้างขึ้น ไม่ให้ข้อมูลรกเวลารันซ้ำ (order_items ลบตามเพราะ ON DELETE CASCADE)
  await pool.query("DELETE FROM orders WHERE customer_name LIKE 'ทดสอบ%'");
  await pool.end();
});

// ================= การยืนยันตัวตน =================
describe("การยืนยันตัวตน (JWT)", () => {
  test("ไม่มี token → 401", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ customer_name: "ทดสอบ", items: [{ menu_item_id: 1, quantity: 1 }] });
    expect(res.statusCode).toBe(401);
  });

  test("ไม่ขึ้นต้นด้วย Bearer → 401", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Authorization", customerToken)
      .send({ customer_name: "ทดสอบ", items: [{ menu_item_id: 1, quantity: 1 }] });
    expect(res.statusCode).toBe(401);
  });

  test("token เซ็นด้วย secret ผิด → 401", async () => {
    const res = await createOrder(
      { customer_name: "ทดสอบ", items: [{ menu_item_id: 1, quantity: 1 }] },
      fakeToken
    );
    expect(res.statusCode).toBe(401);
  });

  test("token หมดอายุ → 401", async () => {
    const expired = jwt.sign({ id: 2, role: "customer" }, jwtSecret, { expiresIn: -10 });
    const res = await createOrder(
      { customer_name: "ทดสอบ", items: [{ menu_item_id: 1, quantity: 1 }] },
      expired
    );
    expect(res.statusCode).toBe(401);
  });
});

// ================= POST /orders =================
describe("POST /orders", () => {
  test("สร้างออเดอร์สำเร็จ → 201 พร้อม id, status pending และยอดรวมถูกต้อง", async () => {
    // ข้าวผัดกุ้ง 60 x 2 + ชาเย็น 25 x 1 = 145
    const res = await createOrder({
      customer_name: "ทดสอบ สร้าง",
      items: [
        { menu_item_id: 1, quantity: 2 },
        { menu_item_id: 15, quantity: 1 },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.status).toBe("pending");
    expect(res.body.total).toBe(145);
  });

  test("ข้อมูลถูกบันทึกลงฐานข้อมูลจริงทั้ง orders และ order_items", async () => {
    const res = await createOrder({
      customer_name: "ทดสอบ บันทึก",
      items: [{ menu_item_id: 2, quantity: 3 }],
    });
    const id = res.body.id;

    const [orders] = await pool.query("SELECT * FROM orders WHERE id = ?", [id]);
    expect(orders).toHaveLength(1);
    expect(orders[0].customer_name).toBe("ทดสอบ บันทึก");
    expect(orders[0].status).toBe("pending");

    const [items] = await pool.query("SELECT * FROM order_items WHERE order_id = ?", [id]);
    expect(items).toHaveLength(1);
    expect(items[0].menu_item_id).toBe(2);
    expect(items[0].quantity).toBe(3);
  });

  test("ไม่ส่ง customer_name → 400", async () => {
    const res = await createOrder({ items: [{ menu_item_id: 1, quantity: 1 }] });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("items ว่าง → 400", async () => {
    const res = await createOrder({ customer_name: "ทดสอบ", items: [] });
    expect(res.statusCode).toBe(400);
  });

  test.each([0, -1, 1.5])("quantity = %p → 400", async (qty) => {
    const res = await createOrder({
      customer_name: "ทดสอบ",
      items: [{ menu_item_id: 1, quantity: qty }],
    });
    expect(res.statusCode).toBe(400);
  });

  test("สั่งเมนูที่หมด (ข้าวขาหมู id 9) → 400", async () => {
    const res = await createOrder({
      customer_name: "ทดสอบ",
      items: [{ menu_item_id: 9, quantity: 1 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("หมด");
  });

  test("สั่งเมนูที่ไม่มีอยู่ → 400", async () => {
    const res = await createOrder({
      customer_name: "ทดสอบ",
      items: [{ menu_item_id: 99999, quantity: 1 }],
    });
    expect(res.statusCode).toBe(400);
  });

  test("สั่งไม่สำเร็จต้องไม่มีออเดอร์ถูกบันทึกค้าง", async () => {
    const [before] = await pool.query("SELECT COUNT(*) AS n FROM orders");
    await createOrder({
      customer_name: "ทดสอบ ไม่ควรบันทึก",
      items: [
        { menu_item_id: 1, quantity: 1 },
        { menu_item_id: 9, quantity: 1 }, // ตัวนี้หมด
      ],
    });
    const [after] = await pool.query("SELECT COUNT(*) AS n FROM orders");
    expect(after[0].n).toBe(before[0].n);
  });
});

// ================= GET /orders/:id =================
describe("GET /orders/:id", () => {
  test("ออเดอร์ 1 (สมชาย) มี 2 รายการ ยอดรวม 170", async () => {
    // ข้าวผัดกุ้ง 60 x 2 + ชาเย็น 25 x 2 = 170
    const res = await request(app)
      .get("/orders/1")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.customer_name).toBe("สมชาย");
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(170);
  });

  test("ออเดอร์ที่ไม่มีอยู่ → 404", async () => {
    const res = await request(app)
      .get("/orders/99999")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.statusCode).toBe(404);
  });

  test("ไม่มี token → 401", async () => {
    const res = await request(app).get("/orders/1");
    expect(res.statusCode).toBe(401);
  });
});

// ================= PATCH /orders/:id/status =================
describe("PATCH /orders/:id/status", () => {
  let orderId;

  beforeAll(async () => {
    // สร้างออเดอร์ของตัวเองไว้แก้ ไม่ไปยุ่งกับข้อมูล seed
    const res = await createOrder({
      customer_name: "ทดสอบ สถานะ",
      items: [{ menu_item_id: 1, quantity: 1 }],
    });
    orderId = res.body.id;
  });

  test("admin เปลี่ยนเป็น preparing ได้ → 200 และฐานข้อมูลเปลี่ยนจริง", async () => {
    const res = await request(app)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "preparing" });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("preparing");

    const [rows] = await pool.query("SELECT status FROM orders WHERE id = ?", [orderId]);
    expect(rows[0].status).toBe("preparing");
  });

  test("customer เปลี่ยนสถานะ → 403 และฐานข้อมูลไม่เปลี่ยน", async () => {
    const res = await request(app)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ status: "delivered" });
    expect(res.statusCode).toBe(403);

    const [rows] = await pool.query("SELECT status FROM orders WHERE id = ?", [orderId]);
    expect(rows[0].status).not.toBe("delivered");
  });

  test("ไม่มี token → 401", async () => {
    const res = await request(app)
      .patch(`/orders/${orderId}/status`)
      .send({ status: "delivered" });
    expect(res.statusCode).toBe(401);
  });

  test("status ไม่ถูกต้อง → 400", async () => {
    const res = await request(app)
      .patch(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "eaten" });
    expect(res.statusCode).toBe(400);
  });

  test("ออเดอร์ที่ไม่มีอยู่ → 404", async () => {
    const res = await request(app)
      .patch("/orders/99999/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "preparing" });
    expect(res.statusCode).toBe(404);
  });
});