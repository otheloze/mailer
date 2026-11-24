// Preconfigured settings for the MYMAILMARKET desktop app.
// Nothing secret belongs here: the app is a window onto the hosted emailer,
// and all sending, credits and billing stay on mymailmarket.com.

const APP_URL = "https://mymailmarket.com";

module.exports = {
  APP_URL,
  START_URL: `${APP_URL}/dashboard`,
  // Hosts the app itself may show. Anything else opens in the default browser.
  APP_HOSTS: ["mymailmarket.com", "www.mymailmarket.com"],
  // Checkout hosts that must stay inside the app so the payment flow can
  // return to mymailmarket.com with the session intact (PayPal uses a popup
  // that talks back to its opener).
  PAYMENT_HOSTS: ["paypal.com", "paypalobjects.com", "paystack.com", "paystack.co", "stripe.com"],
};
