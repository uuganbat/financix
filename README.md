# Санхүү (Financix)

Монголын хэрэглэгчдэд зориулсан хувийн санхүүгийн удирдлагын платформ.
Банкны хуулга (`.xlsx` / `.xls`) parse хийж, гүйлгээг ангилж, банк банкаар
ялгаж, дашбоард + үлдэгдэл/зээлийн тоймоор харуулна.

> **Scope:** SRS-ийн **багасгасан Phase 1 MVP**. SRS-ээс зориудаар хоёр
> зүйлд хазайсан: (1) Turborepo monorepo биш — **нэг Next.js app**
> (`src/db/` нь дараа `packages/` болгон гаргахад бэлэн зохион
> байгуулагдсан), (2) tRPC биш — **REST + OpenAPI** (ирээдүйн Flutter
> client-д type-safe codegen өгөхийн тулд).

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- **Styling:** Tailwind CSS v4 (`@theme` design tokens, light/dark)
- **Database:** PostgreSQL 16 + Drizzle ORM 0.45 + `postgres-js`
- **API:** REST (Next.js Route Handlers) + Zod 4 validation
- **Auth:** Better Auth 1.6 (email/password, scrypt, DB sessions)
- **Parsing:** `exceljs` (`.xlsx`) · pinned SheetJS vendor build (`.xls`)
- **AI:** Claude Haiku — ангиллын fallback (opt-in, default OFF) *(төлөвлөгөөнд)*

## Архитектурын шийдвэрүүд

| Сэдэв | Шийдвэр | Шалтгаан |
|-------|---------|----------|
| App хэлбэр | Нэг Next.js app (monorepo биш) | MVP-д хурд; `src/db/` extract-д бэлэн |
| API хэлбэр | REST + OpenAPI (tRPC биш) | Web + Flutter хоёуланд type-safe client |
| Account number | Зөвхөн сүүлийн 4 орон (`account_last4`) | Бүтэн дугаар хуулгад бий — PII багасгана |
| AI privacy | Layered: opt-in (default OFF) + shared cache + redaction | Cost ↓, latency ↓, privacy ↑ |
| Dedup | `transactions.dedup_hash` дээр unique index | Ижил/давхцсан файл дахин upload хийхэд аюулгүй |
| Delete | Бүх үндсэн table-д `deleted_at` (soft delete) | Санхүүгийн дата санамсаргүй устгахаас хамгаална |
| Auth | Better Auth, нууц үг `account` table-д (scrypt) | SRS-ийн bcrypt/JWT биш — DB session энгийн & найдвартай |

## Боломжууд (хэрэгжсэн)

- **Authentication** — Better Auth email/password. Веб апп бүхэлдээ
  нэвтрэлт шаардана; `/api/*` нь JSON 401 буцаана (Flutter-д тохиромжтой).
- **Хуулга parse** — банк бүрийн форматыг автоматаар таньж normalized
  гүйлгээ болгоно. Parser бүр уншсан орлого/зарлагаа хуулгын footer-тэй
  **центийн нарийвчлалтай** тулгаж шалгадаг.
- **Импорт урсгал** (`POST /api/import`) — upload → detect → parse →
  categorize → dedup → persist, нэг DB transaction дотор. **Idempotent:**
  ижил `file_hash` богино холбоно; гүйлгээ `(account_id, dedup_hash)`-аар
  давхцлыг алгасна.
- **Ангилал** — дүрэмд суурилсан шат (SRS §5.1). AI/shared-cache fallback
  төлөвлөгөөнд.
- **Дашбоард** — банкаар ялгасан тойм, зарлагын ангилал, сүүлийн гүйлгээ,
  ба **"Үлдэгдэл ба зээл"** самбар (бэлэн мөнгө / зээлийн өр / төлсөн хүү).
- **Гүйлгээний хуудас** — банкаар, хуудаслалттай жагсаалт; гүйлгээ бүрийг
  **гараар ангилах** (`PATCH /api/transactions/[id]`).

### Дэмжигдсэн банкууд

| Банк | Формат | Engine | Тэмдэглэл |
|------|--------|--------|-----------|
| Голомт | `.xlsx` | exceljs | JasperReports; per-row balance байхгүй |
| Хаан | `.xlsx` | exceljs | Deposit Account Statement |
| М банк | `.xls` | SheetJS | Oracle BI Publisher |
| ХХБ (TDB) | `.xls` | SheetJS | Crystal Reports — **депозит ба зээлийн** хоёр загвар |
| ХасБанк / Ариг | — | — | Бодит sample хүлээж байна (төлөвлөгөөнд) |

## Setup

```bash
# 1. Dependencies
npm install

# 2. Орчны хувьсагч (DATABASE_URL, BETTER_AUTH_SECRET …)
cp .env.example .env.local
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)

# 3. Schema-г DB рүү буулгах (PostgreSQL 16 ажиллаж байх ёстой)
npm run db:migrate

# 4. Системийн ангилал + dev өгөгдөл seed хийх
npm run db:seed

# 5. Dev server
npm run dev   # → http://localhost:3000
```

> `.env.local` нь gitignored — DB нууц үг, `BETTER_AUTH_SECRET` агуулна.
> `npm run db:up` нь Docker Postgres асаадаг боловч `DATABASE_URL`-ийг
> дурын PostgreSQL 16 руу заасан байж болно.

## DB командууд

| Команд | Үйлдэл |
|--------|--------|
| `npm run db:generate` | Schema-аас SQL migration үүсгэх |
| `npm run db:migrate` | Migration-уудыг DB рүү буулгах |
| `npm run db:push` | Schema-г шууд push (dev зориулалт) |
| `npm run db:studio` | Drizzle Studio (DB browser) |
| `npm run db:seed` | Системийн ангилал + dev user |
| `npm run db:up` / `db:down` | Docker Postgres асаах / зогсоох |

**Migrations:** `0000` schema · `0001` system-category unique ·
`0002` Better Auth tables · `0003` `transactions.balance_after`
(+ rawData-аас backfill, зээлийн данс → `account_type='credit'`).

## Бүтэц

```
src/
├── app/                # Next.js App Router
│   ├── (auth)/         # Нэвтрэх / бүртгүүлэх
│   ├── api/            # REST route handlers (auth, import, transactions)
│   ├── transactions/   # Гүйлгээний жагсаалт + гараар ангилах
│   ├── _components/    # AppShell гэх мэт хуваалцсан UI
│   └── page.tsx        # Дашбоард (үлдэгдэл/зээл самбар орсон)
├── parser/             # Банкны parser-ууд + registry + dedup
├── categorizer/        # Дүрэмд суурилсан ангилал
├── import/             # Импортын service (pipeline-ийг холбоно)
├── dashboard/          # Дашбоардын read model (queries)
├── lib/                # auth, session
└── db/
    ├── schema/         # Drizzle schema (table бүр тусдаа файл)
    ├── migrations/     # SQL migrations
    └── seed.ts         # Системийн ангилал + dev user

scripts/parse-sample.ts # Dogfood: бодит хуулга parse + ангилал (DB-гүй)
```

`src/db/` ба domain модулиуд packages/ рүү гаргахад бэлэн зохион
байгуулагдсан — Flutter/worker нэмэх үед refactor хийнэ.

## Аюулгүй байдал

- **PII:** бодит хуулга (`samples/`) gitignored — хэзээ ч commit хийхгүй.
  Анонимчилсан fixture зөвхөн `src/parser/__fixtures__/`-д.
- **Account number:** зөвхөн сүүлийн 4 орон хадгална.
- **SheetJS** нь patched vendor build (`cdn.sheetjs.com` ≥0.20.3)-д
  pin хийгдсэн — npm `xlsx@0.18.5`-д нээлттэй prototype-pollution
  (CVE-2023-30533) / ReDoS (CVE-2024-22363) байгаа тул ашиглахгүй.
- **Soft delete** + **dedup unique index** дата хамгаалалт.

## Contributing — Next.js 16 анхаарах зүйл

Энэ Next.js хувилбар breaking change-тэй. **Next.js код бичихээс өмнө
`node_modules/next/dist/docs/`-оос холбогдох guide-ыг унш** (`AGENTS.md`).
Гол ялгаанууд: `middleware.ts` → **`src/proxy.ts`** (optimistic cookie
шалгалт; authoritative session нь `getSession()`); `cookies()`/`headers()`
**async**; route handler-ийн `params` нь `Promise<>`; `next dev`
**daemon** болж ажилладаг (npm wrapper гарч одох нь алдаа биш).

## Roadmap (Phase 1 — reduced MVP)

- [x] Scaffold + DB schema + migrations
- [x] Auth (Better Auth email/password, апп gated)
- [x] Банкны parser: Голомт · Хаан · М банк · ХХБ (депозит + зээл)
- [x] Дүрэмд суурилсан ангилал
- [x] Импортын урсгал (idempotent)
- [x] Дашбоард (банкаар) + Үлдэгдэл/Зээл/Хүү самбар
- [x] Гүйлгээний жагсаалт + гараар ангилах
- [ ] ХасБанк / Ариг банкны parser (sample хүлээж байна)
- [ ] AI / shared-cache ангиллын шат (SRS §5.1)
- [ ] Анонимчилсан parser fixture + regression test
