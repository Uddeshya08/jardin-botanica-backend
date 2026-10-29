import { Migration } from "@mikro-orm/migrations";

export class Migration20261029000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "meta_conversion_event" (
      "id" text not null, "order_id" text not null, "dataset_id" text not null, "test_event_code" text null,
      "status" text check ("status" in ('pending', 'sent', 'skipped', 'failed')) not null default 'pending',
      "payload" jsonb null, "attempts" integer not null default 0,
      "next_attempt_at" timestamptz not null, "expires_at" timestamptz not null,
      "last_error" text null, "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "meta_conversion_event_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "IDX_meta_conversion_event_pending" on "meta_conversion_event" ("status", "next_attempt_at") where "deleted_at" is null;`);
    this.addSql(`create index if not exists "IDX_meta_conversion_event_deleted_at" on "meta_conversion_event" ("deleted_at") where "deleted_at" is null;`);
  }
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "meta_conversion_event";`);
  }
}
