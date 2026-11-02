// middleware เรื่องสิทธิ์ทั้งหมดอยู่ที่ไฟล์นี้
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config");

// ตรวจ JWT จาก header  Authorization: Bearer <token>
// ผ่าน -> ใส่ข้อมูลผู้ใช้ไว้ที่ req.user แล้ว next()
// ไม่ผ่าน -> 401
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

// ตรวจบทบาท ต้องใช้ "หลัง" auth เสมอ (เพราะต้องมี req.user ก่อน)
// บทบาทไม่ตรง -> 403
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "ไม่มีสิทธิ์" });
    }
    next();
  };
}

module.exports = { auth, requireRole };
