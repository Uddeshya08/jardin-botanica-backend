import { Migration } from "@mikro-orm/migrations";

export class Migration20261106000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "meta_browser_event" (
      "id" text not null, "dataset_id" text not null, "event_id" text not null,
      "event_name" text check ("event_name" in ('PageView', 'ViewContent', 'AddToCart')) not null,
      "status" text check ("status" in ('pending', 'sent', 'failed')) not null default 'pending',
      "payload" jsonb null, "attempts" integer not null default 0,
      "next_attempt_at" timestamptz not null, "expires_at" timestamptz not null,
      "last_error" text null, "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "meta_browser_event_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "IDX_meta_browser_event_pending" on "meta_browser_event" ("status", "next_attempt_at") where "deleted_at" is null;`);
    this.addSql(`create index if not exists "IDX_meta_browser_event_deleted_at" on "meta_browser_event" ("deleted_at") where "deleted_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "meta_browser_event";`);
  }
}
