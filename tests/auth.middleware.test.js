// unit test ของ middleware โดยตรง ไม่ต้องผ่าน Express และไม่ต้องใช้ฐานข้อมูล
// ใช้ jest.fn() ทำ req / res / next ปลอมขึ้นมา
const jwt = require("jsonwebtoken");
const { auth, requireRole } = require("../middlewares/auth");
const { jwtSecret } = require("../config");

// สร้าง res ปลอมที่เรียก res.status(...).json(...) ต่อกันได้
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("middleware auth", () => {
  test("token ถูกต้อง → เรียก next() และใส่ req.user", () => {
    const token = jwt.sign({ id: 5, role: "customer" }, jwtSecret);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(5);
    expect(req.user.role).toBe("customer");
    expect(res.status).not.toHaveBeenCalled();
  });

  test("ไม่มี header → 401 และไม่เรียก next()", () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("token เสีย → 401", () => {
    const req = { headers: { authorization: "Bearer not-a-real-token" } };
    const res = mockRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("middleware requireRole", () => {
  test("บทบาทตรง → next()", () => {
    const req = { user: { role: "admin" } };
    const res = mockRes();
    const next = jest.fn();

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("บทบาทไม่ตรง → 403", () => {
    const req = { user: { role: "customer" } };
    const res = mockRes();
    const next = jest.fn();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
