# SYNOC — NOC Helpdesk System

Aplikasi **helpdesk NOC** berbasis **MySQL** untuk menangani pelaporan gangguan
jaringan. Terintegrasi dengan **SLA** otomatis dan **master data** lengkap.

> ⚛ Bagian dari repo `synoc`. Dashboard lama tetap tersedia di `/`.

---

## 🌐 URL Publik

| Aplikasi | URL |
|---|---|
| **NOC Helpdesk** | **https://sturdy-carnival-r764v6wqgrf57qr-8000.app.github.dev/helpdesk/** |
| Dashboard | https://sturdy-carnival-r764v6wqgrf57qr-8000.app.github.dev/ |
| Health check | https://sturdy-carnival-r764v6wqgrf57qr-8000.app.github.dev/api/health |

Keduanya dilayani oleh **satu gateway** (`src/gateway.js`) di port `8000`,
karena GitHub Codespaces hanya mengekspos satu endpoint HTTPS publik.

### Kredensial demo

| User | Password | Role |
|---|---|---|
| `admin` | `admin123` | Administrator |
| `noc` | `noc123` | NOC Operator |
| `engineer` | `engineer123` | Field Engineer |

---

## 📋 Fitur

### Jenis Layanan
`Access` · `Backbone` · `Fishbone` · `Other`

### Formulir Tiket

**Informasi Umum** — dua baris dengan grid kolom eksplisit (bukan `auto-fit`),
sehingga jumlah field per baris pasti dan tidak ada kolom kosong:

```
Row 1:  Ticket Title | Jenis Layanan | Priority | Kanal Pelaporan | Cabang
Row 2:  Tanggal Pengajuan | Jam Pengajuan | Problem Description
```

Row 2 berada di dalam *subgroup* "Waktu Pengajuan & Kronologi" (panel dengan
icon jam) agar terlihat sebagai satu kesatuan field. Pada layar < 900 px row 2
turun jadi 2 kolom, pada < 620 px menjadi 1 kolom — tanpa horizontal overflow.

Row 1 memakai grid kolom eksplisit: pada layar lebar (≥ 1560 px) kelima field
sejajar dalam satu baris. Bila ruang tidak cukup, **Ticket Title turun ke baris
sendiri** sementara 4 select tetap satu baris — ini menjaga placeholder
("-- Pilih Jenis Layanan --") tetap utuh tanpa perlu memotong teks. Cabang
selalu berada tepat di sebelah kanan Kanal Pelaporan.

- Ticket Title
- Priority — Low (48 jam) / Medium (24 jam) / High (8 jam) / Critical (4 jam)
- Kanal Pelaporan — Custom / Email / Telegram / WhatsApp / Phone / Portal
- Cabang — dari master data Cabang (opsional)
- Tanggal Pengajuan — `<input type="date">`, default = hari ini, **dapat diubah**
- Jam Pengajuan — `<input type="time">`, default = waktu sekarang, **dapat diubah**
- Problem Description — textarea (60% lebar baris 2)
- ~~Customer~~ — field ini **dihapus** dari form (18 Nov 2026); data lama tetap
  tampil di popup detail (baca saja)

> Tanggal & jam pengajuan yang dipilih menjadi **`tickets.created_at`** tiket,
> menjadi titik awal perhitungan SLA, dan menentukan periode (tahun/bulan)
> pada nomor tiket. Keduanya wajib diisi berpasangan — kalau salah satu kosong
> server mengembalikan `400`.

**Pelapor & Penanggung Jawab**
- Reported By — otomatis dari akun yang login
- PIC — dari master data PIC
- Regional — `WEST` / `CENTRAL` / `EAST` (**wajib** — menentukan nomor tiket)

**Access**
- CID
- Link Name — **dropdown searchable** (ketik nama/CID untuk mencari)
- ISP Name — **dropdown searchable** (ketik nama ISP untuk mencari)
- Link Name (manual)

**Access / Network**
- POP (Point of Presence) — **dropdown searchable** (ketik nama, kode `POP-JKT-01`, atau kota)
- MS / Splitter (MS / Splitter / ONT / CPE) — **dropdown searchable** (ketik nama, kode, tipe, status, atau nama POP)

> Section **Access** dan **Access / Network** hanya tampil ketika
> Jenis Layanan = `Access`. Field di luar section itu ikut dikosongkan
> otomatis agar tidak terkirim ke server.

#### Dropdown searchable (combobox)

Empat field memakai komponen combobox (`public/lib/searchable.js`) —
`<select>` native diganti input yang bisa diketik:

| Field | Pencarian cocok dengan |
|---|---|
| Link Name | nama, link name, CID |
| ISP Name | nama, kode ISP |
| POP | nama, kode (`POP-JKT-01`), kota, provinsi |
| MS / Splitter | nama, kode (`MS-0001`), tipe, status, nama POP |

Perilaku:
- Placeholder berubah dari `-- Pilih X --` menjadi `Ketik nama/kode X…` saat difokus.
- Teks terpilih di-*select* seluruhnya saat diklik → mengetik **mengganti**, bukan menambah.
- `Esc` membatalkan pencarian: teks dikembalikan ke nilai yang tersimpan.
- `Enter` memilih item yang aktif — **tidak** mengirim form.
- Tombol `×` mengosongkan pilihan.
- `Bersihkan` (reset) juga mengosongkan combobox (native `form.reset()` tidak menyentuh-nya).
- Nilai tetap terkirim sebagai `pop_id` / `ms_splitter_id` pada `<input type="hidden">`.

### SLA

- **16 kebijakan SLA** ter-generate otomatis: 4 Jenis Layanan × 4 Priority.
- Multiplier per jenis layanan — Backbone lebih ketat (×0.75), Fishbone (×0.85).
- Due date response & resolution dihitung saat tiket dibuat.
- Jam dijeda otomatis saat tiket masuk status *Pending Customer*.
- Deteksi pelanggaran SLA (breach) + met/not-met pada tiket closed.
- Kepatuhan SLA (%) dihitung atas tiket closed.
- Indikator visual per tiket: meter waktu terpakai, badge `Terlanggar` / `Dalam SLA`.

### Master Data

- **Jenis Layanan** — Access / Backbone / Fishbone / Other
- **Priority** — Low / Medium / High / Critical + target waktu SLA
- **Kanal Pelaporan** — Custom / Email / Telegram / WhatsApp / Phone / Portal
- **Cabang** — unit operasional cabang NOC (Kode, Nama, Regional, Kota,
  Provinsi, Alamat, Telepon, Kepala Cabang). Dipakai sebagai dropdown
  "Cabang" di form Ticket Baru dan disimpan pada `tickets.branch_id`.
- **PIC** — Kode, Nama, Jabatan, Departemen, Telepon, Email, Regional
- **Customer** — Kode, Nama, kontak
- **ISP** — Kode, Nama, kontak
- **POP** — Kode, Nama, Kota, Provinsi, Alamat, lat/lng
- **MS / Splitter** — Kode, Tipe, Nama, POP, MAC, Serial, Status
- **Link** — Kode, Link Name, ISP, Customer, CID, Bandwidth, Media, Site A/B
- **Kebijakan SLA** — per kombinasi Jenis Layanan × Priority

Jenis Layanan · Priority · Kanal Pelaporan · **PIC** · Customer · ISP · POP ·
MS/Splitter · Link · Kebijakan SLA — semuanya full CRUD.

**PIC** (Person in Charge) berisi Kode · Nama · Jabatan · Departemen ·
Telepon · Email · Regional. Dipakai pada dropdown PIC di formulir tiket baru
dan dapat diubah dari panel Aksi pada detail tiket.

> Semua halaman master data mendukung **Tambah → Edit → Simpan → Hapus**.
> Penghapusan bersifat **permanen** — baris dihapus dari database, hilang dari
> daftar maupun dari dropdown, dan kode yang sama boleh dipakai lagi.
> Untuk menyembunyikan data tanpa menghapusnya, ubah field **Aktif** menjadi
> *Tidak* lewat menu Edit (baris tetap tampil dengan badge **Nonaktif** dan
> tidak muncul di dropdown).
>
> Data yang masih dipakai (mis. Jenis Layanan yang dipakai tiket) tidak bisa
> dihapus — sistem menampilkan pesan dan menolak penghapusan.
>
> Kolom numerik memakai `step="any"` agar nilai desimal (lat/lng POP, jam SLA
> pecahan) tetap bisa disimpan.

### Pengujian

```bash
npm run test:master-crud        # 198 pemeriksaan CRUD 11 resource master data
npm run test:ticket-renumber    # 15 pemeriksaan penomoran ulang regional
npm run test:ticket-submitted-at # 14 pemeriksaan tanggal & jam pengajuan
npm run test:ticket-note-time   # 15 pemeriksaan jam pada catatan
npm run test:ticket-attachments # 24 pemeriksaan lampiran gambar pada catatan
```

`test:master-crud` menjalankan uji CRUD menyeluruh untuk 11 resource master data
lewat HTTP API (198 pemeriksaan: create, read, options, search, update, delete,
delete benar-benar hilang, guard duplikat, guard kolom wajib). Semua data uji
dibersihkan otomatis.

`test:ticket-renumber` memverifikasi bahwa mengubah Regional menomori ulang
tiket, timeline ikut diperbarui, dan hanya admin yang boleh mengubah Regional.

`test:ticket-submitted-at` memverifikasi bahwa tanggal & jam pengajuan yang
dipilih dipakai sebagai `created_at`, menjadi titik awal SLA, menentukan periode
nomor tiket, dan menolak input tidak valid (tanggal saja / jam saja / format
salah) dengan `400`.

`test:ticket-note-time` memverifikasi field **Jam** pada kolom Catatan di popup
detail: jam pilihan dipakai sebagai waktu entri timeline, jam kosong memakai
waktu server, dan format tidak valid ditolak `400`.

`test:ticket-attachments` memverifikasi lampiran gambar pada catatan: berkas
tersimpan di disk dengan nama acak, metadata benar, lampiran menempel pada
event yang benar, tipe non-gambar ditolak `400`, endpoint unduh mewajibkan
token, dan berkas ikut terhapus saat tiket dihapus.

### Dashboard

Total tiket · Open · SLA|langgar · Kepatuhan SLA · sebaran status ·
SLA per priority · kanal pelaporan · tren 14 hari · CID teratas · tiket terbaru.

### Daftar Tiket

Kolom: **Aksi** · Nomor Tiket · Judul · Jenis · Prioritas · Kanal · **PIC** ·
Status · SLA · Dibuat.

Kolom **Aksi** (paling kiri) berisi:

| Tombol | Siapa | Fungsi |
|---|---|---|
| **Update** | semua role | Membuka popup detail tiket (status, PIC, handler, catatan, timeline) |
| **Edit** | **admin saja** | Membuka popup edit: judul, Regional, jenis layanan, prioritas, kanal, PIC, deskripsi |

> **Mengganti Regional akan menomori ulang tiket.** Nomor baru mengikuti
> regional baru dengan periode (tahun/bulan) yang sama, contoh:
> `NOCCENTRAL/2026/11/00009` → `NOCWEST/2026/11/00013`. Event timeline
> "Tiket dibuat" otomatis mengikuti nomor terbaru. Pengubahan Regional hanya
> boleh dilakukan oleh **admin** (API membalas `403` untuk role lain).

Filter: pencarian bebas, Jenis Layanan, Prioritas, Kanal, **PIC**, Status SLA.
Pencarian juga mencocokkan nama PIC.

### Popup Detail Tiket — field Jam & Lampiran Gambar pada Catatan

Di section **Aksi** terdapat field **Jam** tepat di sebelah kiri kolom
**Catatan** (baris kedua, di bawah Ubah Status / PIC / Handler), serta zona
**Lampiran Gambar** di bawahnya.

| Field | Fungsi |
|---|---|
| **Jam** | Waktu kejadian catatan (`<input type="time">`). Default = waktu server saat popup dibuka, tetap bisa diubah. |
| **Catatan** | Isi catatan untuk timeline. |
| **Lampiran Gambar** | Zona tarik-lepas / pilih berkas / tempel (Ctrl+V). |

Cara melampirkan gambar — tiga cara, semua didukung:

1. **Tarik-lepas** — seret berkas gambar ke zona.
2. **Pilih berkas** — klik zona (atau tekan `Enter`).
3. **Tempel** — salin gambar / screenshot lalu tekan `Ctrl+V` di dalam popup.

| Batas | Nilai |
|---|---|
| Tipe | JPG · PNG · GIF · WebP · BMP · SVG |
| Ukuran | maks. 5 MB per gambar |
| Jumlah | maks. 6 gambar per catatan |

Gambar yang dipilih tampil sebagai thumbnail dengan tombol hapus (×). Setelah
disimpan, gambar tampil sebagai galeri di entri timeline (klik untuk membuka
ukuran penuh).

Jam yang dipilih dipakai sebagai `ticket_events.created_at` untuk entri
tersebut — jadi operator bisa mencatat kejadian pada jam yang berbeda dari
saat ia dicatat (mis. "timbul 07:45, baru ditindaklanjuti 13:20"). Field ini
juga dipakai saat menyimpan perubahan status.

Jam kosong -> memakai waktu server. Format tidak valid -> `400`.

> 🔒 **Keamanan lampiran.** Berkas disimpan di `noc-helpdesk/uploads/tickets/`
> — **di luar** folder `public/`, sehingga tidak bisa diakses langsung lewat
> URL statis. Satu-satunya jalan aksesnya adalah
> `GET /api/tickets/attachments/:id` yang mewajibkan token JWT. Nama berkas di
> disk diacak (`<timestamp>-<random>.<ext>`) — nama asli tidak pernah dipakai
> sebagai path, sehingga path traversal tidak mungkin. Berkas ikut terhapus
> saat tiket dihapus.

> ⚠️ **Konvensi zona waktu (penting).** Semua kolom `DATETIME` di database
> berisi *wall clock lokal* (diisi `NOW()` / `CURRENT_TIMESTAMP` oleh MySQL).
> `src/db.js` memakai `timezone: 'local'` + `SET time_zone` per koneksi agar
> jam yang tampil di browser sama persis dengan yang tersimpan, dan agar
> perbandingan SLA (`NOW() > resolution_due_at`) konsisten.
> Database lama yang due date-nya masih memakai konvensi UTC bisa diperbaiki
> sekali jalan dengan `npm run db:tz-local` (idempoten).

---

## 🗄 Database

**MySQL 8.0** · database `synoc_noc` · 15 tabel + 2 view.

### Tabel

| Kategori | Tabel |
|---|---|
| Auth | `users` |
| Master | `m_service_type`, `m_customer`, `m_isp`, `m_link`, `m_pop`, `m_ms_splitter`, `m_report_channel`, `m_priority`, `m_pic`, `m_branch` |
| SLA | `m_sla_policy`, `ticket_sla` |
| Tiket | `tickets`, `ticket_events`, `ticket_event_attachments` |
| Audit | `audit_log` |
| Migrasi | `m_schema_migration` (penanda migrasi yang sudah dijalankan) |

### View

- `v_ticket_list` — tiket + join master + status SLA (`sla_overdue`, `sla_running`)
- `v_ticket_sla_status` — ringkasan SLA per tiket

> ⚠️ Saat memakai view MySQL, **alias outer tidak boleh `t`** — definisi view
> sudah meng-alias `tickets` sebagai `t`, sehingga `t.sla_overdue` akan resolve
> ke tabel dalam, bukan ke kolom hasil hitungan. Gunakan alias `v`.

---

## 🚀 Menjalankan

```bash
cd noc-helpdesk

# 1. Install dependensi
npm install

# 2. Siapkan database + master data + SLA + user
cp .env.example .env
npm run db:init          # atau: npm run db:reset (drop & rebuild)
npm run db:seed-demo     # opsional: 24 tiket demo

# 3. Jalankan
./start.sh               # MySQL + gateway di :8000
# atau
npm run gateway          # gateway saja
npm start                # API saja di :4310 (dev)
```

### Environment

| Variable | Default | Keterangan |
|---|---|---|
| `PORT` | `4310` | Port API (mode dev) |
| `PUBLIC_PORT` | `8000` | Port public gateway |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | Koneksi MySQL |
| `DB_USER` / `DB_PASSWORD` | `synoc` / `synoc_password` | User aplikasi |
| `DB_NAME` | `synoc_noc` | Nama database |
| `DB_ROOT_USER` / `DB_ROOT_PASSWORD` | `synoc_admin` / `synoc_admin_password` | User admin (hanya untuk `db:init`) |
| `JWT_SECRET` | — | **Ganti di production** (`openssl rand -hex 48`) |

---

## 🧭 Struktur

```
noc-helpdesk/
├── db/
│   ├── schema.sql        # DDL: tabel, FK, index, view
│   ├── init.js           # bootstrap + seed master data & SLA
│   ├── seed-demo.js      # tiket demo realistis
│   ├── migrate-ticket-number.js  # migrasi nomor tiket lama → format regional
│   ├── test-master-crud.js       # harness CRUD master data (180 cek)
│   └── test-ticket-renumber.js   # harness penomoran ulang regional (15 cek)
├── src/
│   ├── config.js         # konfigurasi terpusat
│   ├── db.js             # pool + helper query
│   ├── auth.js           # JWT + bcrypt + role gate
│   ├── sla.js            # ⚡ mesin SLA (due date, breach, pause/resume)
│   ├── ticket-number.js  # penomoran NOC<REGIONAL>/<YYYY>/<MM>/<seq>
│   ├── server.js         # API server (dev)
│   ├── gateway.js        # 🌐 gateway publik (dashboard + helpdesk)
│   └── routes/
│       ├── auth.js       # login, logout, user
│       ├── tickets.js    # tiket, SLA, dashboard summary
│       └── master.js     # CRUD master data
├── public/               # frontend (vanilla ES modules)
│   ├── index.html
│   ├── styles.css
│   ├── app.js            # bootstrap + router
│   ├── lib/              # api.js, ui.js, searchable.js
│   └── views/            # dashboard, tickets, ticket-form, ticket-detail, ticket-edit, sla, master
├── start.sh
└── .env.example
```

Frontend memakai **vanilla ES modules** — tanpa build step, tanpa framework.
Base path API diturunkan otomatis dari lokasi modul (`import.meta.url`), jadi
aplikasi jalan baik di root maupun di `/helpdesk/`.

---

## 🔌 API

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/auth/login` | Login → JWT |
| `GET` | `/api/auth/me` | Profil user aktif |
| `GET` | `/api/auth/users` | Daftar petugas |
| `GET` | `/api/tickets/dashboard/summary` | Agregasi dashboard |
| `GET` | `/api/tickets` | List + filter (`status`, `priority_id`, `service_type_id`, `channel_id`, `pic_id`, `search`, `overdue`, `cid`, `date_from/to`) |
| `POST` | `/api/tickets` | Buat tiket (SLA terhitung otomatis) |
| `GET` | `/api/tickets/:id` | Detail + timeline + SLA |
| `PUT` | `/api/tickets/:id` | Ubah field (ubah `regional` → nomor tiket di-nomori ulang; admin saja) |
| `POST` | `/api/tickets/:id/status` | Transisi status |
| `POST` | `/api/tickets/:id/assign` | Assignment |
| `POST` | `/api/tickets/:id/events` | Tambah catatan timeline |
| `GET` | `/api/tickets/sla/policies` | Semua kebijakan SLA |
| `GET` | `/api/tickets/sla/preview` | Pratinjau SLA (service + priority) |
| `GET/POST/PUT/DELETE` | `/api/master/:resource` | CRUD master data |

Semua endpoint (kecuali `login` dan `health`) memerlukan header
`Authorization: Bearer <token>`.

### Role

| Role | Akses |
|---|---|
| `admin` | Semua, termasuk hapus master data & tiket |
| `noc` | Buat/ubah tiket, master data (kecuali hapus) |
| `engineer` | Buat/ubah tiket |
| `viewer` | Baca saja |

---

## 📝 Format Nomor Tiket

```
NOC<REGIONAL>/<YYYY>/<MM>/<urut>
NOCCENTRAL/2026/11/00001   ← Regional CENTRAL
NOCWEST/2026/11/00001      ← Regional WEST
NOCEAST/2026/11/00001      ← Regional EAST
```

- **Regional** menentukan bagian tengah nomor — jadi field **Regional** pada
  formulir Tiket Baru bersifat **wajib**.
- **Urut** bersifat unik per Regional per bulan (5 digit, nol di depan).
- Nomor tiket lama (`SYNOC-ACC-202611-0001`) dimigrasikan otomatis dengan
  `npm run db:renumber` — atau otomatis setiap `npm run db:init`.

```bash
npm run db:renumber   # migrasi nomor tiket lama → format regional (idempoten)
```
