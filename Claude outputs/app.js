const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("./db");
const { jwtSecret } = require("./config");

const app = express();
app.use(express.json());

const STATUSES = ["pending", "preparing", "delivered", "cancelled"];

// ---------- middleware ตรวจ JWT ----------
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "ต้องเข้าสู่ระบบ" });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (err) {
    return res.status(401).json({ error: "token ไม่ถูกต้อง" });
  }
}

// ---------- middleware ตรวจสิทธิ์ (ใช้หลัง auth) ----------
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "ไม่มีสิทธิ์" });
    }
    next();
  };
}

// ---------- เมนู ----------
// GET /menu และ GET /menu?maxPrice=50
app.get("/menu", async (req, res) => {
  let sql = "SELECT id, name, price, available FROM menu_items WHERE available = TRUE";
  const params = [];
  if (req.query.maxPrice !== undefined) {
    const maxPrice = Number(req.query.maxPrice);
    if (Number.isNaN(maxPrice) || maxPrice < 0) {
      return res.status(400).json({ error: "maxPrice ต้องเป็นตัวเลขไม่ติดลบ" });
    }
    sql += " AND price <= ?";
    params.push(maxPrice);
  }
  const [rows] = await pool.query(sql, params);
  res.status(200).json(rows);
});

// GET /menu/:id
app.get("/menu/:id", async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, price, available FROM menu_items WHERE id = ?",
    [req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: "ไม่พบเมนู" });
  }
  res.status(200).json(rows[0]);
});

// ---------- ออเดอร์ ----------
// POST /orders  (ต้องล็อกอิน)
// body: { customer_name: "เอ", items: [{ menu_item_id: 1, quantity: 2 }] }
app.post("/orders", auth, async (req, res) => {
  const { customer_name, items } = req.body;

  if (!customer_name || typeof customer_name !== "string") {
    return res.status(400).json({ error: "ต้องระบุ customer_name" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "ต้องมีรายการอาหารอย่างน้อย 1 รายการ" });
  }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: "quantity ต้องเป็นจำนวนเต็มมากกว่า 0" });
    }
  }

  // ตรวจว่าเมนูมีอยู่จริงและยังขายอยู่
  let total = 0;
  for (const item of items) {
    const [rows] = await pool.query(
      "SELECT price, available FROM menu_items WHERE id = ?",
      [item.menu_item_id]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: `ไม่พบเมนู id ${item.menu_item_id}` });
    }
    if (!rows[0].available) {
      return res.status(400).json({ error: `เมนู id ${item.menu_item_id} หมดแล้ว` });
    }
    total += Number(rows[0].price) * item.quantity;
  }

  // บันทึกด้วย transaction ให้ orders กับ order_items สำเร็จพร้อมกัน
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO orders (customer_name) VALUES (?)",
      [customer_name]
    );
    const orderId = result.insertId;
    for (const item of items) {
      await conn.query(
        "INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES (?, ?, ?)",
        [orderId, item.menu_item_id, item.quantity]
      );
    }
    await conn.commit();
    res.status(201).json({ id: orderId, customer_name, status: "pending", total });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "บันทึกออเดอร์ไม่สำเร็จ" });
  } finally {
    conn.release();
  }
});

// GET /orders/:id  (ต้องล็อกอิน) คืนออเดอร์พร้อมรายการและยอดรวม
app.get("/orders/:id", auth, async (req, res) => {
  const [orders] = await pool.query(
    "SELECT id, customer_name, status, created_at FROM orders WHERE id = ?",
    [req.params.id]
  );
  if (orders.length === 0) {
    return res.status(404).json({ error: "ไม่พบออเดอร์" });
  }
  const [items] = await pool.query(
    `SELECT oi.menu_item_id, m.name, m.price, oi.quantity
       FROM order_items oi
       JOIN menu_items m ON m.id = oi.menu_item_id
      WHERE oi.order_id = ?`,
    [req.params.id]
  );
  const total = items.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0);
  res.status(200).json({ ...orders[0], items, total });
});

// PATCH /orders/:id/status  (admin เท่านั้น)
app.patch("/orders/:id/status", auth, requireRole("admin"), async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status ต้องเป็นหนึ่งใน ${STATUSES.join(", ")}` });
  }
  const [result] = await pool.query(
    "UPDATE orders SET status = ? WHERE id = ?",
    [status, req.params.id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "ไม่พบออเดอร์" });
  }
  res.status(200).json({ id: Number(req.params.id), status });
});

module.exports = app;
