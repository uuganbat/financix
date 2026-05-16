CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'credit', 'cash', 'investment');--> statement-breakpoint
CREATE TYPE "public"."bank" AS ENUM('golomt', 'kkb', 'khan', 'mbank', 'tdb', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('manual', 'rule', 'ai', 'shared_cache', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('income', 'expense', 'transfer', 'any');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('file_upload', 'email', 'api', 'manual');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."txn_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"password_hash" varchar(255),
	"avatar_url" text,
	"locale" varchar(10) DEFAULT 'mn' NOT NULL,
	"currency" varchar(3) DEFAULT 'MNT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"bank" "bank" NOT NULL,
	"account_last4" varchar(4),
	"account_type" "account_type" DEFAULT 'checking' NOT NULL,
	"currency" varchar(3) DEFAULT 'MNT' NOT NULL,
	"initial_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"color" varchar(7),
	"icon" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" varchar(100) NOT NULL,
	"name_en" varchar(100),
	"icon" varchar(50),
	"color" varchar(7),
	"type" "category_type" NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"source" "import_source" NOT NULL,
	"bank" "bank" NOT NULL,
	"file_name" varchar(500),
	"file_path" varchar(1000),
	"file_type" varchar(10),
	"file_size" integer,
	"file_hash" varchar(64),
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"total_rows" integer,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"date_range_start" date,
	"date_range_end" date,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"type" "txn_type" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MNT' NOT NULL,
	"description" text NOT NULL,
	"display_name" varchar(500),
	"notes" text,
	"date" date NOT NULL,
	"time" time,
	"transfer_pair_id" uuid,
	"transfer_account_id" uuid,
	"import_id" uuid,
	"bank_ref" varchar(255),
	"raw_data" jsonb,
	"dedup_hash" varchar(64) NOT NULL,
	"category_source" "category_source" DEFAULT 'manual' NOT NULL,
	"category_confidence" numeric(3, 2),
	"is_recurring" boolean DEFAULT false NOT NULL,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"is_reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_pair_id_transactions_id_fk" FOREIGN KEY ("transfer_pair_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_account_id_accounts_id_fk" FOREIGN KEY ("transfer_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_accounts_user_bank_last4" ON "accounts" USING btree ("user_id","bank","account_last4");--> statement-breakpoint
CREATE INDEX "idx_categories_user" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_imports_user" ON "imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_imports_file_hash" ON "imports" USING btree ("user_id","file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_txn_dedup" ON "transactions" USING btree ("account_id","dedup_hash");--> statement-breakpoint
CREATE INDEX "idx_txn_user_date" ON "transactions" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_txn_account_date" ON "transactions" USING btree ("account_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_txn_category" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_txn_type" ON "transactions" USING btree ("user_id","type","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_txn_import" ON "transactions" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "idx_txn_search" ON "transactions" USING gin (to_tsvector('simple', "description"));