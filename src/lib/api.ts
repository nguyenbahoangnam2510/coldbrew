"use client";

/**
 * Gọi backend qua BFF proxy `/api/py/*`. Client KHÔNG mang token nào cả.
 *
 * Trước đây mỗi request phải gắn `Authorization: Bearer <token Clerk>` và
 * `X-Phenau-Tenant-Id`. Giờ cả hai biến mất khỏi trình duyệt: proxy ở server tự
 * gắn API key, mà key đã khoá sẵn tenant + agent nên cũng không cần khai workspace.
 *
 * Điều đó có nghĩa: **không còn bí mật nào nằm trong bundle tải về máy khách**.
 * Thứ duy nhất trình duyệt cầm là cookie phiên đã ký — mất nó cũng chỉ mất quyền
 * vào app, không lộ đường vào backend.
 *
 * (Đi qua proxy nên KHÔNG cần mở CORS ở backend — trình duyệt chỉ nói chuyện với
 * chính origin của app.)
 */

export const API_PREFIX = "/api/py/v1";

/** BFF gắn `X-Coldbrew-Session: expired` khi phiên chết (hết hạn, bị thu hồi, domain bị
 *  khoá). Về /sign-in ngay thay vì để màn hình kẹt với lỗi 401 ở từng ô. Chỉ theo header
 *  này, không theo mọi 401 — 401 vì lý do khác (vd API key legacy hỏng) mà cũng đá ra
 *  thì người dùng đăng nhập lại vẫn bị đá, thành vòng lặp. */
/** Thông điệp lỗi NGẮN, an toàn để hiện thẳng lên giao diện.
 *
 *  16/09/2026: một bản triển khai thiếu `NEXT_PUBLIC_AGENT_ID` nên gọi `/api/chat/` (id rỗng).
 *  Next trả trang 404 bằng HTML, còn khung "Chat thử" lấy nguyên thân phản hồi làm câu trả lời
 *  ⇒ đổ vài nghìn ký tự HTML vào chat. Thân HTML KHÔNG BAO GIỜ là thông điệp cho người dùng:
 *  nghĩa là gọi nhầm đường, không phải backend nói gì. */
export function thongDiepLoi(status: number, raw: string): string {
  const than = (raw || "").trim();
  if (!than) return `HTTP ${status}`;
  try {
    const data = JSON.parse(than);
    const chiTiet = data?.detail ?? data?.error;
    if (typeof chiTiet === "string" && chiTiet.trim()) return `HTTP ${status}: ${chiTiet.trim()}`;
  } catch {
    /* không phải JSON — xử tiếp bên dưới */
  }
  if (/^\s*(<!doctype|<html|<)/i.test(than)) {
    return `HTTP ${status}: máy chủ trả về một trang web thay vì dữ liệu (thường do gọi sai đường dẫn hoặc thiếu cấu hình).`;
  }
  const gon = than.replace(/\s+/g, " ");
  return `HTTP ${status}: ${gon.length > 300 ? gon.slice(0, 300) + "…" : gon}`;
}

export function veDangNhapNeuHetPhien(res: Response): boolean {
  if (res.status !== 401 || res.headers.get("X-Coldbrew-Session") !== "expired") return false;
  if (typeof window !== "undefined") window.location.href = "/sign-in?error=session_expired";
  return true;
}

/** Giữ lại chữ ký cũ để chỗ gọi không phải sửa: nay không có header xác thực nào
 *  cần gắn ở client. Cookie phiên trình duyệt tự gửi kèm. */
export async function authHeaders(): Promise<Record<string, string>> {
  return {};
}

export function makeApi() {
  return async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    for (const [k, v] of Object.entries(await authHeaders())) headers.set(k, v);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${API_PREFIX}${path}`, { ...init, headers });
    if (veDangNhapNeuHetPhien(res)) throw new Error("Phiên đăng nhập đã hết hạn");
    if (!res.ok) {
      // GIỮ LẤY thông điệp của backend. Bản trước ném trần `HTTP 403`, trong khi
      // backend đã nói thẳng "API key missing scope: inbox:read" — mất câu đó thì
      // màn hình chỉ còn con số, và người trực phải đi đào DB mới biết vì sao.
      // Đã tốn đúng một buổi vì chuyện này ngày 20/08/2026.
      throw new Error(thongDiepLoi(res.status, await res.text().catch(() => "")));
    }
    // 204 hoặc thân rỗng → đừng ép JSON.parse chuỗi rỗng.
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  };
}

/**
 * Gọi endpoint SSE và ĐỌC DẦN, gọi `onEvent` cho từng sự kiện ngay khi tới.
 *
 * Vì sao không dùng `res.text()`: nó chờ trọn phản hồi rồi mới trả về, nên chat
 * thử đứng im 5–10 giây rồi cả đoạn nhảy ra một lần — trong khi backend đã bắn
 * từng mảnh `delta` ngay từ giây đầu. Đọc dần thì chữ chạy như ChatGPT.
 */
export function makeStreamApi() {
  /** `path` bắt đầu bằng "/api/" thì gọi thẳng (route handler của app);
   *  còn lại thì ghép tiền tố proxy `/api/py/v1`. */
  return async function stream(
    path: string,
    init: RequestInit,
    onEvent: (ev: Record<string, unknown>) => void,
  ): Promise<void> {
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(await authHeaders())) headers.set(k, v);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const url = path.startsWith("/api/") ? path : `${API_PREFIX}${path}`;
    const res = await fetch(url, { ...init, headers });
    if (veDangNhapNeuHetPhien(res)) throw new Error("Phiên đăng nhập đã hết hạn");
    if (!res.ok || !res.body) {
      throw new Error(thongDiepLoi(res.status, await res.text().catch(() => "")));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Giữ lại mảnh cuối: gói tin có thể cắt giữa một dòng, ghép tiếp vòng sau.
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {
          /* dòng hỏng — bỏ, đừng làm đứt cả stream */
        }
      }
    }
  };
}
