"use client";

/**
 * Chat THỬ với trợ lý — hỏi để xem nó trả lời thế nào, KHÔNG đụng khách thật.
 *
 * Vì sao tách hẳn khỏi hộp thư: nhân viên cần thử "khách hỏi câu này thì bot đáp
 * gì" trước khi bật tự động trả lời. Thử ngay trong hội thoại khách thì tin thử
 * bay thẳng sang Facebook của họ.
 *
 * BỐ CỤC HAI KHUNG như route chat của dashboard: danh sách phiên bên trái, nội
 * dung bên phải. Phiên lấy bằng `GET /conversations?agent_id=…&scope=mine` —
 * `scope=mine` là phiên của CHÍNH người đang đăng nhập, khác `scope=all` (hội
 * thoại khách) mà hộp thư dùng. Cùng endpoint, khác scope.
 *
 * Gửi qua route handler `/api/chat/{id}` chứ KHÔNG qua rewrite `/api/py`:
 * rewrite đi bằng `fetch()` của Node, mà `fetch()` ĐỆM phản hồi nên chữ hiện
 * một cục sau 5–10 giây. Route handler dùng `node:http` đẩy từng chunk.
 *
 * Nó gọi tiếp `POST /agents/{id}/chat` (đường đã đăng nhập). Agent demo để
 * visibility `internal` nên `/public/agents/...` trả 404 — không dùng được.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AGENT_ID } from "@/lib/brand";
import { MOCK } from "@/lib/mock";
import { Composer } from "@/components/composer";
import { Avatar, DotsIcon, IconBtn } from "@/components/ui";
import { makeApi, makeStreamApi } from "@/lib/api";
import { MessageContent } from "@/components/message-content";
import type { Citation, Conversation, Message } from "@/lib/types";

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function TestPanel() {
  const api = useMemo(() => makeApi(), []);
  const stream = useMemo(() => makeStreamApi(), []);

  const [sessions, setSessions] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Màn hẹp chỉ đủ chỗ cho MỘT khung. Trước đây danh sách phiên bị `hidden` thẳng,
  // nên trên điện thoại không có đường nào xem lại phiên cũ — hỏi xong là mất.
  // Cùng lối với tab Hộp thư: danh sách ↔ chi tiết, có mũi tên quay lại.
  const [moChat, setMoChat] = useState(false);

  const loadSessions = useCallback(async () => {
    if (MOCK || !AGENT_ID) {
      setSessions([]);
      return;
    }
    try {
      const qs = new URLSearchParams({ agent_id: AGENT_ID, scope: "mine", limit: "30" });
      setSessions(await api<Conversation[]>(`/conversations?${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSessions([]);
    }
  }, [api]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const openSession = useCallback(
    async (id: string) => {
      setActiveId(id);
      setMoChat(true);
      setMessages([]);
      setError(null);
      try {
        setMessages(await api<Message[]>(`/conversations/${id}/messages`));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [api],
  );

  const newSession = useCallback(() => {
    setActiveId(null);
    setMoChat(true);
    setMessages([]);
    setError(null);
  }, []);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    setError(null);
    setMessages((p) => [
      ...p,
      { id: `u-${Date.now()}`, role: "user", content, created_at: new Date().toISOString() },
    ]);
    setBusy(true);

    if (MOCK) {
      setTimeout(() => {
        setMessages((p) => [
          ...p,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: "(chế độ mock) Tắt NEXT_PUBLIC_MOCK để chat với trợ lý thật.",
            created_at: new Date().toISOString(),
          },
        ]);
        setBusy(false);
      }, 400);
      return;
    }

    try {
      // Có `conversation_id` thì nói tiếp phiên cũ; không có thì backend mở phiên mới.
      const body: Record<string, string> = { message: content };
      if (activeId) body.conversation_id = activeId;
      // Bong bóng rỗng dựng TRƯỚC, rồi mỗi mảnh `delta` nối thêm vào — chữ chạy
      // dần thay vì hiện một cục sau 10 giây.
      const replyId = `a-${Date.now()}`;
      let acc = "";
      let newConvId: string | null = null;
      setMessages((p) => [
        ...p,
        { id: replyId, role: "assistant", content: "", created_at: new Date().toISOString() },
      ]);

      if (!AGENT_ID) {
        // Thiếu NEXT_PUBLIC_AGENT_ID thì đường gọi thành `/api/chat/` ⇒ trang 404.
        // Chặn tại đây để người dùng thấy đúng nguyên nhân thay vì một đống HTML.
        throw new Error(
          "Bản triển khai này chưa cấu hình mã trợ lý (NEXT_PUBLIC_AGENT_ID). Đặt biến trên Vercel rồi Redeploy.",
        );
      }
      await stream(`/api/chat/${AGENT_ID}`, { method: "POST", body: JSON.stringify(body) }, (ev) => {
        if (ev.type === "delta") {
          acc += String(ev.content ?? "");
          setMessages((p) => p.map((m) => (m.id === replyId ? { ...m, content: acc } : m)));
        } else if (ev.type === "citations_updated") {
          // Nguồn chỉ biết được SAU khi trả lời xong, nên nó tới ở cuối luồng chứ
          // không đi kèm từng mảnh chữ. Gắn vào đúng bong bóng đang chạy: chip đang
          // xám sẽ đổi sang xanh và bấm được, không phải tải lại trang.
          const cs = (ev.citations ?? []) as Citation[];
          setMessages((p) =>
            p.map((m) => (m.id === replyId ? { ...m, metadata: { citations: cs } } : m)),
          );
        } else if (ev.type === "conversation" && ev.conversation_id) {
          newConvId = String(ev.conversation_id);
        }
      });

      if (!acc.trim()) {
        setMessages((p) =>
          p.map((m) => (m.id === replyId ? { ...m, content: "(trợ lý không trả lời)" } : m)),
        );
      }
      if (newConvId && !activeId) {
        setActiveId(newConvId);
        void loadSessions();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [draft, busy, activeId, stream, loadSessions]);

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* ── Danh sách phiên ── */}
      <aside
        className={`${moChat ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r bg-[var(--wa-panel)] md:w-[320px] lg:w-[360px]`}
        style={{ borderColor: "var(--wa-border)" }}
      >
        <header className="flex h-[60px] shrink-0 items-center justify-between px-4">
          <h2 className="text-[20px] font-bold" style={{ color: "var(--wa-text)" }}>
            Phiên thử
          </h2>
          <div className="flex items-center gap-1">
            <IconBtn label="Menu">
              <DotsIcon />
            </IconBtn>
            <IconBtn label="Phiên mới" onClick={newSession}>
              <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </IconBtn>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sessions === null && (
            <p className="p-4 text-[13.5px]" style={{ color: "var(--wa-text-soft)" }}>
              Đang tải…
            </p>
          )}
          {sessions?.length === 0 && (
            <p className="p-4 text-[13.5px]" style={{ color: "var(--wa-text-soft)" }}>
              Chưa có phiên nào. Hỏi một câu là tạo phiên mới.
            </p>
          )}
          {sessions?.map((c) => {
            const on = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => void openSession(c.id)}
                className="flex w-full items-center gap-3 px-3 py-[10px] text-left transition border-b"
                style={{
                  borderColor: "var(--wa-border)",
                  background: on ? "var(--wa-panel-active)" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!on) e.currentTarget.style.background = "var(--wa-panel-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!on) e.currentTarget.style.background = "";
                }}
              >
                <Avatar size={48} name={c.title || "Phiên thử"} id={c.id} variant="test" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-medium" style={{ color: "var(--wa-text)" }}>
                      {c.title || "Phiên không tên"}
                    </span>
                    <span className="shrink-0 text-[12px]" style={{ color: "var(--wa-text-soft)" }}>
                      {timeOnly(c.updated_at)}
                    </span>
                  </span>
                  <span className="mt-[2px] flex items-center gap-1">
                    <span className="truncate text-[13.5px]" style={{ color: "var(--wa-text-soft)" }}>
                      {c.message_count ?? 0} tin nhắn
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Nội dung ── */}
      <div className={`${moChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        <header
          className="flex h-[60px] shrink-0 items-center gap-3 px-4"
          style={{ background: "var(--wa-chrome)" }}
        >
          <Avatar size={40} name="Trợ lý" variant="bot" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium" style={{ color: "var(--wa-text)" }}>
              Chat thử với trợ lý
            </span>
            <span className="block text-[13px]" style={{ color: "var(--wa-text-soft)" }}>
              Khách không nhìn thấy đoạn chat này
            </span>
          </span>
          {/* "Phiên mới" đã có ở đầu danh sách; ở đây cần đường VỀ danh sách hơn. */}
          <button
            onClick={() => setMoChat(false)}
            aria-label="Quay lại danh sách phiên"
            className="rounded-full px-3 py-[5px] text-[13px] font-medium md:hidden"
            style={{ background: "var(--wa-panel)", color: "var(--wa-text)" }}
          >
            ← Phiên
          </button>
        </header>

        {/* Cùng cách với tab Hộp thư: `flex-col-reverse` để đáy là vị trí mặc định.
            Mở phiên thử là thấy ngay lượt gần nhất, không phải ngồi xem màn hình cuộn
            từ đầu phiên xuống. Khe đáy rộng hơn khe đỉnh vì đáy là chỗ mắt dừng. */}
        <div className="wa-doodle flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 pb-8 pt-2 md:px-[6%]">
          {messages.length === 0 && (
            <p className="mt-6 text-center text-[14px]" style={{ color: "var(--wa-text-soft)" }}>
              Thử hỏi như một khách hàng để xem trợ lý trả lời thế nào.
            </p>
          )}
          {[...messages].reverse().map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} className={`mt-2 flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-lg px-[9px] py-[6px] shadow-sm md:max-w-[65%]"
                  style={{ background: mine ? "var(--wa-out)" : "var(--wa-panel)" }}
                >
                  {m.content ? (
                    <div className="text-[14.2px] leading-[19px]" style={{ color: "var(--wa-text)" }}>
                      <MessageContent content={m.content} citations={m.metadata?.citations} />
                    </div>
                  ) : (
                    // Bong bóng đã dựng nhưng chữ chưa tới: ba chấm nhấp nháy NGAY
                    // TRONG bong bóng. Làm chỉ báo thành khối riêng thì lúc chữ bắt
                    // đầu chạy sẽ thấy hai khối cùng lúc.
                    <span className="flex items-center gap-[3px] px-[2px] py-[6px]" aria-label="Trợ lý đang soạn">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="wa-dot h-[5px] w-[5px] rounded-full"
                          style={{ background: "#9aa5ab", animationDelay: `${i * 0.16}s` }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {error && (
            <p className="mt-2 text-center text-[13px] text-red-700">Lỗi gọi trợ lý: {error}</p>
          )}
        </div>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          placeholder="Hỏi thử một câu…"
          disabled={busy}
        />
      </div>
    </div>
  );
}
