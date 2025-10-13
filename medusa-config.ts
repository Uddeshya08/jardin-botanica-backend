import { loadEnv, defineConfig } from "@medusajs/framework/utils";
import { Modules } from "@medusajs/framework/utils"
loadEnv(process.env.NODE_ENV || "development", process.cwd());

console.log("id => ", process.env.RAZORPAY_ID);
console.log("secret ", process.env.RAZORPAY_SECRET);

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  plugins: [
    "medusa-plugin-razorpay-v2", 
    {
    resolve: `medusa-plugin-contentful`,
    options: {
      space_id: process.env.CONTENTFUL_SPACE_ID,
      access_token: process.env.CONTENTFUL_ACCESS_TOKEN,
      environment: process.env.CONTENTFUL_ENV,
    },
  },
],
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      dependencies: [
        Modules.PAYMENT
      ],
      options: {
        providers: [
          {
            resolve: "medusa-plugin-razorpay-v2/providers/payment-razorpay/src",
            id: "razorpay",
            options: {
              key_id: 'rzp_test_KZp3v4sgtPHTJI',
              key_secret: '6iBecocanXPMuol08SHvt0zZ',
              razorpay_account: 'QmIYdoc2xbazYx',
              automatic_expiry_period: 30 /* any value between 12minuts and 30 days expressed in minutes*/,
              manual_expiry_period: 20,
              refund_speed: "normal",
              webhook_secret: 'rzp_webhook_7xTgD3k9LqPz!2Vn',
            },
          },
        ],
      },
    },
    // {
    //   resolve: "@medusajs/medusa/fulfillment",
    //   dependencies: [
    //     Modules.FULFILLMENT
    //   ],
    //   options: {
    //     providers: [
    //       {
    //         resolve: "@medusajs/medusa/fulfillment-manual",
    //         id: "manual",
    //       },
    //       {
    //         resolve: "./src/modules/delhivery-fulfillment",
    //         id: "delhivery",
    //         options: {
    //           apiToken: '28e27442e6480b1e121f5329cf4e42bcb1c20967',
    //           isProduction: process.env.NODE_ENV === "production",
    //           warehouseCode: process.env.DELHIVERY_WAREHOUSE_CODE || "462024",
    //           clientName: process.env.DELHIVERY_CLIENT_NAME || "Jardin Botanica",
    //         },
    //       },
    //     ],
    //   },
    // },
    // {
    //   resolve: "@medusajs/notification",
    //   options: {
    //     providers: [
    //       {
    //         resolve: "@medusajs/medusa/notification-local",
    //         id: "local",
    //         options: {
    //           name: "Local Notification Provider",
    //           channels: ["feed"],
    //         },
    //       },
    //       {
    //         resolve: "./src/modules/resend-notification",
    //         id: "my-notification",
    //         options: {
    //           channels: ["email"],
    //           apiKey: process.env.RESEND_API_KEY || 're_6vVfXKF3_49nTkiv9ehQQ2oxGkoHpw6ah'
    //         },
    //       },
    //     ],
    //   },
    // },
  ],
});