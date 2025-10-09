import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { INotificationModuleService } from "@medusajs/framework/types"

export default async function productCreateHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService: INotificationModuleService =
    container.resolve(Modules.NOTIFICATION)

  await notificationModuleService.createNotifications({
    to: "nirbhaysingh943012@gmail.com",
    channel: "email",
    template: "product-created",
    data,
  })
}

export const config: SubscriberConfig = {
  event: "product.created",
}