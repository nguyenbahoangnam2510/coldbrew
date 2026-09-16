/** Thông điệp lỗi hiện thẳng lên chat, nên không được đổ nguyên thân phản hồi vào đó. */
import assert from "node:assert/strict";
import { test } from "node:test";

const { thongDiepLoi } = await import("../api.ts");

test("trang HTML (vd 404 của Next) không được đổ vào khung chat", () => {
  const html = '<!DOCTYPE html><html><head><title>Hộp thư</title></head><body>' + "x".repeat(5000) + "</body></html>";
  const msg = thongDiepLoi(404, html);
  assert.match(msg, /^HTTP 404: máy chủ trả về một trang web/);
  assert.ok(msg.length < 200, `thông điệp quá dài: ${msg.length}`);
  assert.ok(!msg.includes("<html"), "không được chứa HTML");
});

test("giữ nguyên câu backend nói khi là JSON", () => {
  assert.equal(
    thongDiepLoi(403, JSON.stringify({ detail: "API key missing scope: inbox:read" })),
    "HTTP 403: API key missing scope: inbox:read",
  );
  assert.equal(thongDiepLoi(400, JSON.stringify({ error: "Nguồn gốc không hợp lệ" })), "HTTP 400: Nguồn gốc không hợp lệ");
});

test("văn bản thường thì cắt ngắn, thân rỗng thì chỉ còn mã lỗi", () => {
  const dai = thongDiepLoi(500, "lỗi ".repeat(500));
  assert.ok(dai.length <= 320, `chưa cắt: ${dai.length}`);
  assert.ok(dai.endsWith("…"));
  assert.equal(thongDiepLoi(502, "   "), "HTTP 502");
});
