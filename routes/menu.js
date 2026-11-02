// เส้นทางของเมนู ถูก mount ไว้ที่ /menu ใน app.js
// ดังนั้น router.get("/") = GET /menu และ router.get("/:id") = GET /menu/:id
const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /menu และ GET /menu?maxPrice=50
router.get("/", async (req, res) => {
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
router.get("/:id", async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, price, available FROM menu_items WHERE id = ?",
    [req.params.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: "ไม่พบเมนู" });
  }
  res.status(200).json(rows[0]);
});

module.exports = router;
