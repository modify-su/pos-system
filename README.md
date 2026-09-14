# 🏪 Smart POS & Warehouse Management System
ระบบจัดการร้านค้า คลังสินค้า และจุดขายครบวงจร (Smart POS & Warehouse) รองรับการใช้งานทั้งบนคอมพิวเตอร์และมือถือ iOS / Android

---

## 🌟 คุณสมบัติเด่น (Features)

| โมดูล | รายละเอียด |
| :--- | :--- |
| 🛒 **POS ขายหน้าร้าน** | ค้นหาสินค้าด่วน, สแกนบาร์โค้ด / QR Code จากกล้องมือถือ, พิมพ์ใบเสร็จ, รองรับเงินสด / โอนเงิน / บัตรเครดิต |
| 📥 **รับเข้าสินค้า (Stock IN)** | สแกนรับสินค้าเข้าคลัง, พิมพ์ใบรับสินค้า (PO), สร้างและพิมพ์สติกเกอร์ Barcode / QR Code ติดซองสินค้า |
| 📤 **เบิกจ่ายสินค้า (Stock OUT)** | สแกนเบิกสินค้า, ระบบขออนุมัติเบิกจ่าย, ออกใบเบิกสินค้า, พิมพ์สติกเกอร์บาร์โค้ดกำกับ |
| 📦 **คลังสินค้า (Inventory)** | ติดตามสต็อกคงเหลือแบบเรียลไทม์, แจ้งเตือนสินค้าใกล้หมด / สินค้าหมดสต็อก, ประวัติการเคลื่อนไหวสต็อก |
| 📊 **Dashboard อัจฉริยะ** | สรุปยอดขาย, กำไรขั้นต้น, กราฟยอดขาย 14 วัน, สินค้าขายดี Top 10, สัดส่วนหมวดหมู่สินค้า |
| 📱 **รองรับการสแกนบนมือถือ** | ใช้งานผ่าน Safari (iOS) และ Chrome (Android) พร้อมโหมด **"📸 ถ่ายรูปสแกน"** และกล้องสดพร้อมเลเซอร์และไฟแฟลช |
| ⚡ **Realtime WebSockets** | ข้อมูลสต็อกและการเคลื่อนไหวอัปเดตตรงกันทันทีทุกหน้าจอผ่าน Socket.io |
| 🛡️ **ระบบกำหนดสิทธิ์ผู้ใช้งาน** | Role-Based Access Control (Admin, Cashier, Storekeeper) พร้อมระบบตั้งค่าสิทธิ์รายบุคคล |

---

## 🚀 วิธีการติดตั้งและรันระบบ (Getting Started)

### ความต้องการของระบบ (Requirements)
- **Node.js** v18+ 
- **npm** v8+

### 1. ติดตั้ง Dependencies
```bash
# ติดตั้ง Backend
cd backend
npm install

# ติดตั้ง Frontend
cd ../frontend
npm install
```

### 2. เริ่มต้นรันเซิร์ฟเวอร์ (Development)

**หน้าต่างที่ 1 (Backend API & WebSockets):**
```bash
cd backend
npm run dev
# เซิร์ฟเวอร์จะทำงานที่ http://localhost:3001
```

**หน้าต่างที่ 2 (Frontend Web App):**
```bash
cd frontend
npm run dev -- --host
# เว็บแอพจะทำงานที่ http://localhost:5173
```

---

## 📱 การใช้งานผ่านมือถือ (Mobile Access)
1. เชื่อมต่อมือถือเข้ากับ Wi-Fi วงเดียวกันกับเครื่องเซิร์ฟเวอร์
2. เปิดเบราว์เซอร์บนมือถือไปที่:
   `http://<IP_เครื่องคอมพิวเตอร์>:5173` (เช่น `http://192.168.1.109:5173`)
3. เข้าสู่ระบบและใช้งานกล้องสแกนบาร์โค้ด/QR Code ได้ทันที

---

## 🔑 บัญชีผู้ใช้งานเริ่มต้น (Default Accounts)

| Username | Password | บทบาท (Role) | สิทธิ์การเข้าถึง |
| :--- | :--- | :--- | :--- |
| `admin` | `admin1234` | ผู้ดูแลระบบ (Admin) | เข้าถึงได้ทุกเมนู + จัดการสิทธิ์การใช้งาน |
| `cashier` | `cashier1234` | แคชเชียร์ (Cashier) | หน้าขาย POS, เบิกจ่ายสินค้า |
| `storekeeper` | `store1234` | พนักงานคลัง (Storekeeper) | คลังสินค้า, รับเข้าสินค้า, เบิกจ่ายสินค้า |

---

## 🛠️ Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Html5-QRCode, Recharts, Zustand
- **Backend:** Node.js, Express, SQLite3, Socket.io, JWT, bcryptjs, Multer
- **Database:** SQLite (WAL mode)

