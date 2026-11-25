import { Migration } from "@mikro-orm/migrations";

export class Migration20261116000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "meta_browser_event" drop constraint if exists "meta_browser_event_event_name_check";`);
    this.addSql(`alter table "meta_browser_event" add constraint "meta_browser_event_event_name_check"
      check ("event_name" in ('PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo'));`);
  }

  override async down(): Promise<void> {
    // Refuse rollback while new-event receipts exist instead of deleting tracking data.
    this.addSql(`alter table "meta_browser_event" drop constraint if exists "meta_browser_event_event_name_check";`);
    this.addSql(`alter table "meta_browser_event" add constraint "meta_browser_event_event_name_check"
      check ("event_name" in ('PageView', 'ViewContent', 'AddToCart'));`);
  }
}
