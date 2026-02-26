import { Migration } from '@mikro-orm/migrations';

export class Migration20260225095044 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "bundle_text" ("id" text not null, "text" text not null, "sort_order" integer not null default 0, "bundle_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_text_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_text_bundle_id" ON "bundle_text" (bundle_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_text_deleted_at" ON "bundle_text" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "bundle_text" add constraint "bundle_text_bundle_id_foreign" foreign key ("bundle_id") references "bundle" ("id") on update cascade;`);

    this.addSql(`alter table if exists "bundle_item" add constraint "bundle_item_bundle_id_foreign" foreign key ("bundle_id") references "bundle" ("id") on update cascade;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_item_bundle_id" ON "bundle_item" (bundle_id) WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "choice_slot" add constraint "choice_slot_bundle_id_foreign" foreign key ("bundle_id") references "bundle" ("id") on update cascade;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_choice_slot_bundle_id" ON "choice_slot" (bundle_id) WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "choice_option" add constraint "choice_option_choice_slot_id_foreign" foreign key ("choice_slot_id") references "choice_slot" ("id") on update cascade;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_choice_option_choice_slot_id" ON "choice_option" (choice_slot_id) WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bundle_text" cascade;`);

    this.addSql(`alter table if exists "bundle_item" drop constraint if exists "bundle_item_bundle_id_foreign";`);

    this.addSql(`alter table if exists "choice_option" drop constraint if exists "choice_option_choice_slot_id_foreign";`);

    this.addSql(`alter table if exists "choice_slot" drop constraint if exists "choice_slot_bundle_id_foreign";`);

    this.addSql(`drop index if exists "IDX_bundle_item_bundle_id";`);

    this.addSql(`drop index if exists "IDX_choice_option_choice_slot_id";`);

    this.addSql(`drop index if exists "IDX_choice_slot_bundle_id";`);
  }

}
