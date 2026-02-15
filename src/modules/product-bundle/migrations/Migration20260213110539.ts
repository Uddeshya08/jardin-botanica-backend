import { Migration } from '@mikro-orm/migrations';

export class Migration20260213110539 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "bundle" ("id" text not null, "title" text not null, "description" text null, "medusa_product_id" text null, "medusa_variant_id" text null, "bundle_price" integer not null, "bundle_image" text null, "is_active" boolean not null default true, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_deleted_at" ON "bundle" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "bundle_item" ("id" text not null, "bundle_id" text not null, "medusa_variant_id" text not null, "quantity" integer not null default 1, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_item_deleted_at" ON "bundle_item" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "choice_option" ("id" text not null, "choice_slot_id" text not null, "medusa_variant_id" text not null, "quantity" integer not null default 1, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "choice_option_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_choice_option_deleted_at" ON "choice_option" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "choice_slot" ("id" text not null, "bundle_id" text not null, "slot_name" text not null, "slot_description" text null, "required" boolean not null default true, "min_selections" integer not null default 1, "max_selections" integer not null default 1, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "choice_slot_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_choice_slot_deleted_at" ON "choice_slot" (deleted_at) WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bundle" cascade;`);

    this.addSql(`drop table if exists "bundle_item" cascade;`);

    this.addSql(`drop table if exists "choice_option" cascade;`);

    this.addSql(`drop table if exists "choice_slot" cascade;`);
  }

}
