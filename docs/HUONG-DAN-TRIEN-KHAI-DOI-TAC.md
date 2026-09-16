# Coldbrew — Hướng dẫn triển khai cho đối tác

Coldbrew là **hộp thư vận hành** chạy dưới tên miền của chính doanh nghiệp. Nhân viên mở
`chatbot.tenmiencuaban.com` để đọc và trả lời tin nhắn khách, xử lý yêu cầu, xem báo cáo.
Dữ liệu và agent nằm ở Phê Nâu; Coldbrew chỉ là giao diện mang thương hiệu của bạn.

---

## 1. Luồng hoạt động

```
Nhân viên → chatbot.tenmiencuaban.com  (Coldbrew trên Vercel)
                    │
                    ├── dữ liệu → phenau.com/api/py → hệ thống Phê Nâu
                    └── đăng nhập → phenau.com (tài khoản Phê Nâu của nhân viên)
```

- Trình duyệt **chỉ nói chuyện với domain của bạn**. Khoá và địa chỉ hệ thống nằm ở server.
- Nhân viên đăng nhập bằng **tài khoản Phê Nâu cá nhân**, không dùng mật khẩu dùng chung.
  Mật khẩu chỉ nhập trên phenau.com; Coldbrew không bao giờ thấy.
- Phiên đăng nhập kéo dài 12 giờ và bị khoá theo **domain + workspace + agent**.

## 2. Ai làm gì

| Việc | Bên làm |
|---|---|
| Tạo agent, cấp quyền workspace, mời nhân viên | **Phê Nâu** |
| Map domain Coldbrew và xác minh tên miền | **Phê Nâu** (bạn thêm bản ghi DNS) |
| Tạo project trên Vercel, đặt biến môi trường | **Đối tác** |
| Thêm bản ghi DNS (CNAME, TXT) | **Đối tác** |
| Vận hành hằng ngày: trả lời khách, xử lý yêu cầu | **Đối tác** |

## 3. Chuẩn bị

- Tài khoản **Vercel** (gói Hobby là đủ để chạy thử).
- Quyền sửa **DNS** của tên miền sẽ dùng.
- Từ Phê Nâu, bạn nhận: **`agent_id`** của hộp thư và lời mời vào workspace cho từng nhân viên.

## 4. Các bước triển khai

### Bước 1 — Tạo project trên Vercel

1. Vercel → **Add New → Project** → chọn repo Coldbrew.
2. Framework: Next.js. Giữ nguyên các thiết lập build mặc định.
3. Đặt biến môi trường (mục 5), rồi **Deploy**.

### Bước 2 — Gắn tên miền

1. Vercel → **Settings → Domains → Add** → nhập `chatbot.tenmiencuaban.com`.
2. Vercel hiện một bản ghi cần thêm. Vào DNS của tên miền và thêm:

   | Type | Name | Value |
   |---|---|---|
   | CNAME | `chatbot` | giá trị Vercel hiển thị (dạng `xxxxx.vercel-dns-0xx.com`) |

3. Chờ Vercel báo domain hợp lệ và cấp chứng chỉ HTTPS.

### Bước 3 — Xác minh tên miền với Phê Nâu

Phê Nâu khai domain của bạn và gửi lại **một bản ghi TXT**. Bạn thêm vào DNS:

| Type | Name | Value |
|---|---|---|
| TXT | `_phenau-coldbrew.chatbot` | `phenau-coldbrew-verification=<mã Phê Nâu gửi>` |

Báo lại Phê Nâu để bấm **Kiểm tra DNS**. Xác minh xong mới đăng nhập được.

> **Vì sao cần bước này:** để không ai khác khai tên miền của bạn trên hệ thống. Chỉ người
> quản lý DNS mới thêm được bản ghi đó. Bản ghi TXT không ảnh hưởng website hay email.

### Bước 4 — Mời nhân viên

Phê Nâu mời từng nhân viên vào workspace theo email. Vai trò tối thiểu:

| Vai trò | Làm được gì |
|---|---|
| `viewer` | Chỉ xem |
| `operator` | Xem, trả lời khách, xử lý yêu cầu — **mức thường dùng cho nhân viên trực** |
| `editor` trở lên | Thêm quyền sửa cấu hình agent |

Nhân viên nghỉ việc thì Phê Nâu gỡ khỏi workspace, người đó mất quyền ngay ở request kế tiếp.

### Bước 5 — Kiểm thử

1. Mở `https://chatbot.tenmiencuaban.com` → bấm **Đăng nhập tài khoản**.
2. Đăng nhập bằng tài khoản Phê Nâu → phải vào thẳng hộp thư.
3. Mở một hội thoại, gửi thử một tin.
4. Thử bằng tài khoản **chưa** được mời: phải bị từ chối.

## 5. Biến môi trường

**Bắt buộc**

| Biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_AGENT_ID` | `agent_id` Phê Nâu cung cấp |
| `NEXT_PUBLIC_BRAND_NAME` | Tên hiện trên tab trình duyệt và màn đăng nhập |

**Tuỳ chọn**

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NEXT_PUBLIC_BRAND_ACCENT` | `#1F4470` | Mã màu nhấn, dạng hex |
| `NEXT_PUBLIC_ENABLE_DEAL_REVENUE` | bật | Ô nhập số tiền khi chuyển yêu cầu sang "Đã xong". Đặt `0` để tắt |
| `NEXT_PUBLIC_ENABLE_INSIGHT_REPORT` | tắt | Đặt `1` để hiện tab Báo cáo |
| `PHENAU_URL` | `https://phenau.com` | Chỉ đặt khi Phê Nâu yêu cầu trỏ môi trường khác |

**Không đặt**

- `NEXT_PUBLIC_MOCK` — đặt `1` sẽ bỏ qua đăng nhập và hiện dữ liệu giả. Chỉ dùng khi chạy thử trên máy.
- Bất kỳ khoá hay mật khẩu nào dưới tiền tố `NEXT_PUBLIC_`: biến loại này bị nhúng vào mã tải
  về trình duyệt, coi như công khai.

Biến `NEXT_PUBLIC_` được gắn cứng lúc build, nên **đổi giá trị xong phải Redeploy**.

## 6. Thống kê website (tuỳ chọn)

Muốn đo lượt xem, lượt bấm gọi, bấm Zalo hay Messenger trên website bán hàng:

1. Phê Nâu tạo một **site theo dõi** và gửi bạn đoạn mã nhúng.
2. Dán đoạn mã vào phần `<head>` của website:

   ```html
   <script async src="https://phenau.com/phin.js" data-site="phin_..."></script>
   ```

3. Tên miền website phải **khớp chính xác** tên miền đã khai với Phê Nâu, kể cả có `www` hay không.
4. Số liệu hiện ở tab Báo cáo trong Coldbrew (nhớ bật `NEXT_PUBLIC_ENABLE_INSIGHT_REPORT=1`).

Mã `phin_...` là mã công khai nằm trong HTML, không phải mật khẩu. Nó chỉ nhận dữ liệu gửi từ
đúng tên miền đã khai, và xoay được bất cứ lúc nào mà không mất số liệu cũ.

## 7. Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `404: DEPLOYMENT_NOT_FOUND` | Tên miền chưa gắn vào project Vercel | Thêm domain ở Settings → Domains |
| "Tài khoản không có quyền vào website này" | Domain chưa được map, hoặc tài khoản chưa vào workspace | Báo Phê Nâu map domain và mời tài khoản |
| "Tên miền của website này chưa được xác minh" | Thiếu bản ghi TXT hoặc DNS chưa cập nhật | Kiểm tra lại bản ghi TXT, chờ vài phút rồi nhờ Phê Nâu bấm Kiểm tra DNS |
| Bị đưa về trang đăng nhập kèm "Phiên đăng nhập đã hết hạn" | Quá 12 giờ, hoặc quyền đã bị thu hồi | Đăng nhập lại |
| "Liên kết đăng nhập không hợp lệ hoặc đã được mở ở trình duyệt khác" | Mở link đăng nhập ở trình duyệt khác với nơi bắt đầu | Bấm Đăng nhập lại từ đầu trên cùng một trình duyệt |
| Tab Báo cáo không có số liệu | Chưa nhúng `phin.js`, hoặc tên miền không khớp | Kiểm tra thẻ script và tên miền đã khai |
| Chat thử báo "chưa cấu hình mã trợ lý", hoặc tiêu đề tab hiện "Hộp thư" thay vì tên thương hiệu | Biến `NEXT_PUBLIC_*` chưa có lúc build | Đặt biến trên Vercel rồi **Redeploy**, bỏ chọn "Use existing build cache" |

## 8. Lưu ý vận hành

- **Bản preview trên Vercel dùng dữ liệu thật.** Nên bật Deployment Protection cho preview,
  hoặc hỏi Phê Nâu cấp môi trường riêng.
- **Phiên 12 giờ:** hết ca phải đăng nhập lại. Đăng xuất sẽ thu hồi phiên ngay ở phía máy chủ.
- **Đổi tên miền** của hộp thư sẽ huỷ xác minh cũ và đăng xuất mọi người; cần làm lại bước 2 và 3.
- Mỗi doanh nghiệp một project Vercel riêng, cùng mã nguồn, khác biến môi trường.

## 9. Hỗ trợ

Khi báo lỗi, gửi kèm: tên miền đang dùng, email tài khoản, thời điểm xảy ra, ảnh chụp màn hình
và mã lỗi (nếu có). Liên hệ: dudupython@gmail.com — hoặc https://phenau.com/support.
