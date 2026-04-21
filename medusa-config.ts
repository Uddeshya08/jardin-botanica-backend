import {
  loadEnv,
  defineConfig,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils";
import { Modules } from "@medusajs/framework/utils";
loadEnv(process.env.NODE_ENV || "development", process.cwd());

console.log("id => ", process.env.RAZORPAY_ID);
console.log("secret ", process.env.RAZORPAY_SECRET);

const r2FileStorageEnabled =
  process.env.USE_R2_FILE_STORAGE === "true" ||
  process.env.NODE_ENV === "production";

const r2Endpoint =
  process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined);

const r2FileModule = r2FileStorageEnabled
  ? {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-s3",
            id: "s3",
            options: {
              file_url: process.env.R2_FILE_URL,
              access_key_id: process.env.R2_ACCESS_KEY_ID,
              secret_access_key: process.env.R2_SECRET_ACCESS_KEY,
              region: "auto",
              bucket: process.env.R2_BUCKET,
              endpoint: r2Endpoint,
              prefix: process.env.R2_PREFIX,
              cache_control:
                process.env.R2_CACHE_CONTROL || "public, max-age=31536000",
              download_file_duration: process.env.R2_DOWNLOAD_FILE_DURATION
                ? Number(process.env.R2_DOWNLOAD_FILE_DURATION)
                : undefined,
            },
          },
        ],
      },
    }
  : undefined;

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
        allowedHosts: process.env.ALLOWED_HOSTS?.split(",") || [],
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
    // "medusa-payment-manual",
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      dependencies: [Modules.PAYMENT],
      options: {
        providers: [
          {
            resolve: "medusa-plugin-razorpay-v2/providers/payment-razorpay/src",
            id: "razorpay",
            options: {
              key_id: "rzp_test_KZp3v4sgtPHTJI",
              key_secret: "6iBecocanXPMuol08SHvt0zZ",
              razorpay_account: "QmIYdoc2xbazYx",
              automatic_expiry_period: 30 /* any value between 12minuts and 30 days expressed in minutes*/,
              manual_expiry_period: 20,
              refund_speed: "normal",
              auto_capture: true,
              webhook_secret: "rzp_webhook_7xTgD3k9LqPz!2Vn",
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
          {
            resolve: "./src/modules/delhivery-fulfillment",
            id: "delhivery",
            options: {
              pickupLocationName: "Jardin Botanica",
            },
          },
        ],
      },
    },

    {
      resolve: "@medusajs/medusa/auth",
      dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",

            id: "emailpass",
          },
          {
            resolve: "@medusajs/medusa/auth-google",
            id: "google",
            options: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              callbackUrl: process.env.GOOGLE_CALLBACK_URL,
            },
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

    // Product Bundle Module
    {
      resolve: "./src/modules/product-bundle",
    },
    // Customer Preferences Module
    {
      resolve: "./src/modules/customer-preferences",
    },
    ...(r2FileModule ? [r2FileModule] : []),
  ],
});
