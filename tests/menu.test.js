const request = require("supertest");
const app = require("../app");
const { pool } = require("../db");

afterAll(async () => {
  await pool.end();
});

describe("GET /menu", () => {
  test("ตอบกลับ 200 และเป็น array", async () => {
    const res = await request(app).get("/menu");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("คืนเฉพาะเมนูที่ยังขายอยู่ 20 รายการ", async () => {
    const res = await request(app).get("/menu");
    expect(res.body).toHaveLength(20);
    res.body.forEach((item) => {
      expect(item.available).toBe(1);
    });
  });

  test("ไม่มีเมนูที่หมดแล้ว (ข้าวขาหมู, น้ำแตงโม)", async () => {
    const res = await request(app).get("/menu");
    const names = res.body.map((item) => item.name);
    expect(names).not.toContain("ข้าวขาหมู");
    expect(names).not.toContain("น้ำแตงโม");
  });

  test("แต่ละรายการมี id, name, price ครบ", async () => {
    const res = await request(app).get("/menu");
    res.body.forEach((item) => {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("price");
    });
  });
});

describe("GET /menu?maxPrice=", () => {
  test("maxPrice=50 คืนเฉพาะเมนูราคาไม่เกิน 50 ที่ยังขายอยู่ (10 รายการ)", async () => {
    const res = await request(app).get("/menu").query({ maxPrice: 50 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(10);
    res.body.forEach((item) => {
      expect(Number(item.price)).toBeLessThanOrEqual(50);
      expect(item.available).toBe(1);
    });
  });

  test("maxPrice ไม่ใช่ตัวเลข → 400", async () => {
    const res = await request(app).get("/menu").query({ maxPrice: "abc" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /menu/:id", () => {
  test("id=1 ได้ข้าวผัดกุ้ง ราคา 60", async () => {
    const res = await request(app).get("/menu/1");
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe("ข้าวผัดกุ้ง");
    expect(Number(res.body.price)).toBe(60);
  });

  test("id ที่ไม่มีอยู่ → 404", async () => {
    const res = await request(app).get("/menu/99999");
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});