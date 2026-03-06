import { model } from "@medusajs/framework/utils"

export const Preference = model.define("preference", {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    email_updates: model.boolean().default(false),
    newsletter: model.boolean().default(false),
})

export default Preference
