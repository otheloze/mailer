// Preconfigured settings for the MYMAILMARKET desktop app.
// Nothing secret belongs here: the app is a window onto the hosted emailer,
// and all sending, credits and billing stay on mymailmarket.com.
const { app } = require("electron");

const PRODUCTION_URL = "https://mymailmarket.com";

// Development only: `MMM_APP_URL=http://localhost:3000 npm start` points the app
// at a local server. The installed app ignores it and always uses production.
const devOverride = !app.isPackaged && process.env.MMM_APP_URL ? new URL(process.env.MMM_APP_URL) : null;
const APP_URL = devOverride ? devOverride.origin : PRODUCTION_URL;

module.exports = {
  APP_URL,
  START_URL: `${APP_URL}/dashboard`,
  // Hosts the app itself may show. Anything else opens in the default browser.
  APP_HOSTS: devOverride ? [devOverride.hostname] : ["mymailmarket.com", "www.mymailmarket.com"],
  // Plain http is only accepted for a local development server.
  ALLOW_HTTP: !!devOverride && ["localhost", "127.0.0.1"].includes(devOverride.hostname),
  // Checkout hosts that must stay inside the app so the payment flow can
  // return to mymailmarket.com with the session intact (PayPal uses a popup
  // that talks back to its opener).
  PAYMENT_HOSTS: ["paypal.com", "paypalobjects.com", "paystack.com", "paystack.co", "stripe.com"],
};
