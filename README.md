# Portfolio-Local

เว็บพอร์ตโฟลิโอแบบ **static ล้วน** — ไม่มีเซิร์ฟเวอร์ ไม่มีฐานข้อมูล
ข้อมูลอยู่ในไฟล์ JSON รูปอยู่ในโฟลเดอร์ `images/` เอาขึ้น GitHub Pages ได้ตรง ๆ

🔗 https://frame5482.github.io/Portfolio-Local/

---

## โครงสร้าง

```
index.html          หน้าโปรไฟล์
works.html          หน้ารวมผลงาน
work-detail.html    หน้ารายละเอียดผลงาน
admin.html          หน้าแก้ไขผลงาน (ทำงานในเบราว์เซอร์ล้วน)

data/
├── works.json      ← ฐานข้อมูลผลงาน (แทน MongoDB)
└── tags.json       ← ลำดับ / ไฮไลต์ของแท็ก
images/             ← รูปทั้งหมด (แทน Cloudinary)
css/  js/
.nojekyll           บอก GitHub ว่าไม่ต้องรัน Jekyll
```

ทุกไฟล์อยู่ที่ root ของ repo → GitHub Pages เปิด `index.html` ให้เลย (ไม่ไปโชว์ README)

---

## ตั้งค่า GitHub Pages (ครั้งเดียว)

**Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: **main** / **(root)** → Save

รอสักครู่แล้วเปิด `https://frame5482.github.io/Portfolio-Local/`

---

## วิธีเพิ่ม / แก้ผลงาน

เปิด `admin.html` (ดับเบิลคลิกไฟล์ในเครื่อง หรือเปิดจากลิงก์เว็บก็ได้) แล้ว:

### แบบสะดวกสุด — Chrome / Edge

1. กด **📂 เชื่อมโฟลเดอร์** → เลือกโฟลเดอร์ `Portfolio-Local`
2. เพิ่ม / แก้ / ลบผลงาน ลากจัดลำดับ ปักดาว จัดการแท็ก ได้ตามปกติ
3. กด **💾 บันทึก** → เขียนลง `data/works.json`, `data/tags.json` และ copy รูปใหม่เข้า `images/` ให้เอง
4. commit + push

```bash
git add -A
git commit -m "update works"
git push
```

### เบราว์เซอร์อื่น (Firefox / Safari)

กด **⬇️ ดาวน์โหลดไฟล์** แทน จะได้ `works.json`, `tags.json` และรูปใหม่
เอาไปวางทับใน `data/` กับ `images/` เอง แล้ว commit + push

> การแก้ไขทั้งหมดเกิดในเบราว์เซอร์ ไม่มีการส่งข้อมูลไปไหน
> เว็บจริงจะเปลี่ยนก็ต่อเมื่อ push ขึ้น GitHub แล้วเท่านั้น

---

## รูปแบบข้อมูลใน works.json

```json
{
  "id": "69e90642498565882fb4e66b",
  "title": "Aria 3D Model",
  "title_th": "...", "title_en": "...", "title_jp": "...",
  "description_th": "...", "description_en": "...", "description_jp": "...",
  "image_url": "images/aria-cover.jpg",
  "images": ["images/aria-01.png", "images/aria-02.png"],
  "video_url": "https://www.youtube.com/watch?v=xxxxx",
  "videos": [],
  "tags": "Model, Character Design",
  "is_starred": true,
  "order": 0,
  "created_at": "2026-04-22T15:28:00.000Z"
}
```

- path ของรูปเป็นแบบ relative (`images/...`) เพื่อให้ใช้ได้ทั้งเปิดในเครื่องและบน GitHub Pages
- ใส่ลิงก์ภายนอก (`https://...`) แทน path ในเครื่องก็ได้
- ลำดับการแสดง: ปักดาวก่อน → ตาม `order` → ใหม่สุดก่อน

จะแก้ `data/works.json` ด้วยมือใน editor ตรง ๆ ก็ได้เหมือนกัน

---

## หมายเหตุ

- โฟลเดอร์ `_legacy-backup/` เก็บของเก่าจากเวอร์ชันที่ใช้เซิร์ฟเวอร์ (SQLite + uploads เดิม)
  ไม่ได้ถูก commit และไม่เกี่ยวกับเว็บแล้ว — ลบทิ้งได้เลย
- ขนาดรวมของ repo ควรไม่เกิน ~1 GB ตามลิมิตของ GitHub Pages (ตอนนี้รูปประมาณ 88 MB)
