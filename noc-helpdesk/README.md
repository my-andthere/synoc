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

**Informasi Umum**
- Ticket Title
- Priority — Low (48 jam) / Medium (24 jam) / High (8 jam) / Critical (4 jam)
- Kanal Pelaporan — Custom / Email / Telegram / WhatsApp / Phone / Portal
- Problem Description
- Customer, Reported By, Reporter Contact, Assigned To, Team

**Access**
- CID
- Link Name (terisi otomatis dari master Link)
- ISP Name (terisi otomatis dari master Link)

**Access / Network**
- POP (Point of Presence)
- MS / Splitter (MS / Splitter / ONT / CPE)

**Parameter Teknis**
- MAC Address
- Serial Number
- VLAN ID
- Signal Input CPE (dBm)
- Latitude
- Longitude

### SLA

- **16 kebijakan SLA** ter-generate otomatis: 4 Jenis Layanan × 4 Priority.
- Multiplier per jenis layanan — Backbone lebih ketat (×0.75), Fishbone (×0.85).
- Due date response & resolution dihitung saat tiket dibuat.
- Jam dijeda otomatis saat tiket masuk status *Pending Customer*.
- Deteksi pelanggaran SLA (breach) + met/not-met pada tiket closed.
- Kepatuhan SLA (%) dihitung atas tiket closed.
- Indikator visual per tiket: meter waktu terpakai, badge `Terlanggar` / `Dalam SLA`.

### Master Data

Jenis Layanan · Priority · Kanal Pelaporan · Customer · ISP · POP ·
MS/Splitter · Link · Kebijakan SLA — semuanya full CRUD dengan soft-delete.

### Dashboard

Total tiket · Open · SLA|langgar · Kepatuhan SLA · sebaran status ·
SLA per priority · kanal pelaporan · tren 14 hari · CID teratas · tiket terbaru.

---

## 🗄 Database

**MySQL 8.0** · database `synoc_noc` · 16 tabel + 2 view.

### Tabel

| Kategori | Tabel |
|---|---|
| Auth | `users` |
| Master | `m_service_type`, `m_customer`, `m_isp`, `m_link`, `m_pop`, `m_ms_splitter`, `m_report_channel`, `m_priority` |
| SLA | `m_sla_policy`, `ticket_sla` |
| Tiket | `tickets`, `ticket_events` |
| Audit | `audit_log` |

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
│   └── seed-demo.js      # tiket demo realistis
├── src/
│   ├── config.js         # konfigurasi terpusat
│   ├── db.js             # pool + helper query
│   ├── auth.js           # JWT + bcrypt + role gate
│   ├── sla.js            # ⚡ mesin SLA (due date, breach, pause/resume)
│   ├── ticket-number.js  # penomoran SYNOC-<TYPE>-<YYYYMM>-<seq>
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
│   ├── lib/              # api.js, ui.js
│   └── views/            # dashboard, tickets, ticket-form, ticket-detail, sla, master
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
| `GET` | `/api/tickets` | List + filter (`status`, `priority_id`, `service_type_id`, `channel_id`, `search`, `overdue`, `cid`, `date_from/to`) |
| `POST` | `/api/tickets` | Buat tiket (SLA terhitung otomatis) |
| `GET` | `/api/tickets/:id` | Detail + timeline + SLA |
| `PUT` | `/api/tickets/:id` | Ubah field |
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
SYNOC-<TIPE>-<YYYYMM>-<urut>
SYNOC-ACC-202611-0001   ← Access
SYNOC-BBC-202611-0001   ← Backbone
SYNOC-FSB-202611-0001   ← Fishbone
SYNOC-OTH-202611-0001   ← Other
```

Urut bersifat unik per Jenis Layanan per bulan.
