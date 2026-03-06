import { Migration } from '@mikro-orm/migrations';

export class Migration20260306121741 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "preference" ("id" text not null, "customer_id" text not null, "email_updates" boolean not null default false, "newsletter" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "preference_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_preference_deleted_at" ON "preference" (deleted_at) WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "preference" cascade;`);
  }

}
