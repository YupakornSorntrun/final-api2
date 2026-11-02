// ประกอบ app: ใส่ middleware กลาง แล้ว mount router แต่ละกลุ่ม
// ไม่มี app.listen ที่นี่ (อยู่ใน server.js) เพื่อให้ Supertest ใช้ app ได้
const express = require("express");
const menuRoutes = require("./routes/menu");
const orderRoutes = require("./routes/orders");

const app = express();
app.use(express.json());

app.use("/menu", menuRoutes);
app.use("/orders", orderRoutes);

// ไม่มี route ไหนตรง -> 404
app.use((req, res) => {
  res.status(404).json({ error: "ไม่พบเส้นทาง" });
});

module.exports = app;
