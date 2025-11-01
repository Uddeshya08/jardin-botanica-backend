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
  admin: {
    vite: () => ({
      server: {
        allowedHosts: process.env.ALLOWED_HOSTS?.split(',') || [],
      },
    }),
  },
  plugins: [
    "medusa-plugin-razorpay-v2", 
    {
    resolve: `medusa-plugin-contentful`,
    options: {
      space_id: process.env.CONTENTFUL_SPACE_ID,
      access_token: process.env.CONTENTFUL_ACCESS_TOKEN,
      environment: process.env.CONTENTFUL_ENV,
      webhook_secret: process.env.CONTENTFUL_WEBHOOK_SECRET,
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
    {
      resolve: "@medusajs/medusa/fulfillment",
      dependencies: [
        Modules.FULFILLMENT
      ],
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
        ],
      },
    },
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