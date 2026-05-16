# Санхүү (Financix)

Монголын хэрэглэгчдэд зориулсан хувийн санхүүгийн удирдлагын платформ. Банкны хуулга parse хийж, гүйлгээг ангилж, дашбоардаар харуулна.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Database:** PostgreSQL 16 + Drizzle ORM
- **API:** REST + OpenAPI (Next.js Route Handlers + Zod)
- **Auth:** Auth.js (дараагийн commit)
- **AI:** Claude Haiku (categorization fallback, opt-in)

## Архитектурын шийдвэрүүд

| Сэдэв | Шийдвэр | Шалтгаан |
|-------|---------|----------|
| API хэлбэр | REST + OpenAPI | Web + Flutter хоёуланд type-safe client codegen |
| Account number | Зөвхөн сүүлийн 4 орон (`account_last4`) | Бүтэн дугаар хуулга файлд аль хэдийн бий — PII багасгана |
| AI privacy | Layered: opt-in (default OFF) + shared cache + redaction | Cost ↓, latency ↓, privacy ↑ |
| Dedup | `transactions.dedup_hash` дээр unique index | Ижил файл дахин upload хийхэд давхцал хаана |
| Delete | Бүх үндсэн table-д `deleted_at` (soft delete) | Санхүүгийн дата санамсаргүй устгахаас хамгаална |

## Setup

```bash
# 1. Dependencies
npm install

# 2. Орчны хувьсагч
cp .env.example .env.local

# 3. Postgres асаах
npm run db:up

# 4. Schema-г DB рүү буулгах
npm run db:migrate

# 5. Dev server
npm run dev
```

## DB командууд

| Команд | Үйлдэл |
|--------|--------|
| `npm run db:up` | Docker дээр Postgres асаах |
| `npm run db:down` | Postgres зогсоох |
| `npm run db:generate` | Schema-аас SQL migration үүсгэх |
| `npm run db:migrate` | Migration-уудыг DB рүү буулгах |
| `npm run db:push` | Schema-г шууд push (dev зориулалт) |
| `npm run db:studio` | Drizzle Studio (DB browser) |

## Бүтэц

```
src/
├── app/                # Next.js App Router
└── db/
    ├── schema/         # Drizzle schema (table бүр тусдаа файл)
    ├── migrations/     # Generated SQL migrations
    └── index.ts        # DB client
```

Schema файлууд packages/ рүү гаргахад бэлэн зохион байгуулагдсан — Flutter/worker нэмэх үед refactor хийнэ.

## Roadmap (Phase 1 — reduced MVP)

- [x] Scaffold + DB schema + migrations
- [ ] Auth (email)
- [ ] Account + Transaction CRUD (manual entry)
- [ ] Голомт parser
- [ ] Rule-based categorization
- [ ] Dashboard (энэ сар view)
