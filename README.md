# Portfolio-Local

เว็บพอร์ตโฟลิโอที่ใช้ **ไฟล์ JSON เป็นฐานข้อมูล** และ **โฟลเดอร์รูปในโปรเจกต์** แทน MongoDB + Cloudinary
ทำให้เอาขึ้น **GitHub Pages** ได้ฟรี ไม่ต้องมีเซิร์ฟเวอร์

---

## โครงสร้างข้อมูล

```
public/
├── data/
│   ├── works.json   ← ฐานข้อมูลผลงานทั้งหมด (แทน MongoDB collection "works")
│   └── tags.json    ← ลำดับ / การไฮไลต์ของแท็ก (แทน collection "tags")
├── images/          ← รูปทั้งหมด (แทน Cloudinary)
├── css/  js/        ← หน้าเว็บ
└── index.html  works.html  work-detail.html  admin.html
```

- หน้าเว็บสาธารณะ (`index` / `works` / `work-detail`) อ่านไฟล์ JSON ตรง ๆ ผ่าน `js/data-source.js`
  → **ไม่ต้องใช้เซิร์ฟเวอร์เลย** เปิดจาก GitHub Pages ได้ทันที
- URL ของรูปเก็บเป็น path แบบ relative เช่น `images/aria-123.png`
  → ใช้ได้ทั้งตอนรันเครื่องตัวเองและตอนอยู่ใต้ path ย่อยของ GitHub Pages

---

## วิธีใช้งาน (เพิ่ม / แก้ผลงาน)

หน้า Admin ต้องใช้เซิร์ฟเวอร์ในเครื่อง เพราะต้องเขียนไฟล์ JSON และเซฟรูปลงโฟลเดอร์

```bash
npm install
npm start
```

เปิด http://localhost:3000/admin.html แล้วล็อกอินด้วยรหัสใน `.env` (`ADMIN_PASSWORD`)

เพิ่ม / แก้ / ลบผลงาน → เซิร์ฟเวอร์จะอัปเดต `public/data/*.json` และ `public/images/` ให้อัตโนมัติ

จากนั้น push ขึ้น GitHub เพื่อให้เว็บจริงอัปเดต:

```bash
git add public/data public/images
git commit -m "update works"
git push
```

> เปิด `admin.html` บน GitHub Pages ได้ แต่จะขึ้นข้อความแจ้งว่าอัปโหลดไม่ได้
> เพราะ GitHub Pages รันแต่ไฟล์ static ไม่มี backend

---

## Deploy ขึ้น GitHub Pages

มี workflow ให้แล้วที่ `.github/workflows/deploy-pages.yml` (deploy โฟลเดอร์ `public/`)

ตั้งค่าครั้งเดียวในหน้า repo:

**Settings → Pages → Build and deployment → Source: `GitHub Actions`**

หลังจากนั้นทุกครั้งที่ push ขึ้น `main` เว็บจะอัปเดตเองที่
`https://frame5482.github.io/Portfolio-Local/`

---

## ย้ายข้อมูลจาก MongoDB + Cloudinary (ทำครั้งเดียว — ทำไปแล้ว)

```bash
npm run migrate
```

สคริปต์ `scripts/migrate-from-mongo.js` จะ:
1. อ่าน works / tags จาก `MONGODB_URI` ใน `.env`
2. โหลดรูปทุกใบจาก Cloudinary (และลิงก์ภายนอกอื่น ๆ) ลง `public/images/`
3. เขียน `public/data/works.json` และ `public/data/tags.json`

รันซ้ำได้ รูปที่โหลดไว้แล้วจะไม่โหลดใหม่

> หลังย้ายเสร็จ ตัวแปร `MONGODB_URI` และ `CLOUDINARY_*` ใน `.env` ไม่ได้ใช้แล้ว
> เหลือแค่ `PORT` กับ `ADMIN_PASSWORD` (จะลบทิ้งหรือเก็บไว้เผื่อ migrate ซ้ำก็ได้)

---

## หมายเหตุ

- `data/` และ `uploads/` ที่อยู่นอก `public/` เป็นของเวอร์ชันเก่า (SQLite) ไม่ได้ใช้แล้ว ลบทิ้งได้
- `public/images/` ต้อง commit ขึ้น git ด้วย เพราะเป็นที่เก็บรูปจริงของเว็บ
- ขนาดรูปรวมควรไม่เกิน ~1 GB ตามลิมิตของ GitHub Pages
