# MYMAILMARKET

A self-hosted email marketing workspace built with Next.js, Supabase, Resend, React Email, and Tailwind CSS. Supabase is the source of truth for workspace data and consent; Resend handles Segments, Broadcasts, delivery, scheduling, and unsubscribe processing.

## Requirements

- Node.js 20+
- A Supabase project
- A Resend account and a verified sending domain
- A public URL for production webhooks (Vercel works)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values below. Keep server secrets out of source control and never use a `NEXT_PUBLIC_` prefix for secret keys.

3. In Supabase, open **SQL Editor**, run every migration in `supabase/migrations` in date order, and enable email/password sign-in under **Authentication → Providers**. Configure the confirmation redirect URL as `http://localhost:3000/auth/callback`.

4. In Resend, create an API key and verify the domain you plan to use in the sender address. Add a Resend webhook pointing to `http://localhost:3000/api/webhooks/resend` for local development (use a public tunnel) or to `https://mymailmarket.com/api/webhooks/resend` in production.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Configure the PayPal, Paystack, and Truehost credentials below, then visit `https://mymailmarket.com` for the public product homepage. Domain availability and pricing are searched live with Truehost; domain checkout and registration are not enabled. Hosting purchases are handled at `https://my.mymailmarket.com/client/store`. The authenticated workspace is at `/dashboard`; sign in at `/login`, configure the company mailing address and sender defaults in **Settings**, create an audience, add contacts who have explicitly opted in, then create a campaign.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase browser/auth key; database access is restricted by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for webhooks and admin tools | Server-only key used by verified payment/email webhooks and role-checked admin routes |
| `RESEND_API_KEY` | Yes for sending | Server-only Resend API key |
| `RESEND_WEBHOOK_SECRET` | Yes for webhook processing | Resend webhook signing secret (`whsec_…`) |
| `DEFAULT_SENDER_DOMAINS` | Recommended | Comma-separated sender domains every workspace may use (must be verified in Resend). Customer domains are granted per user in **Administration** |
| `ORDER_FROM_EMAIL` | Optional | Sender for lead data order confirmations (on a Resend-verified domain) |
| `ORDER_NOTIFICATION_EMAIL` | Optional | Receives an alert for every paid lead data order |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Yes for PayPal | Public PayPal app client ID |
| `PAYPAL_CLIENT_SECRET` | Yes for PayPal checkout | Server-only PayPal app secret |
| `PAYPAL_ENVIRONMENT` | Yes for PayPal | `sandbox` for testing or `live` for production |
| `PAYPAL_WEBHOOK_ID` | Yes for PayPal activation | Webhook ID from the selected PayPal app |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Optional | Public Paystack key; server-side redirect checkout does not expose or require it |
| `PAYSTACK_SECRET_KEY` | Yes for Paystack checkout and verification | Server-only Paystack secret key |
| `TRUEHOST_API_URL` | Yes for domain search | Truehost DomainsReseller API endpoint |
| `TRUEHOST_API_USERNAME` | Yes for domain search | Server-only Truehost reseller API username |
| `TRUEHOST_API_KEY` | Yes for domain search | Server-only Truehost reseller API key |
| `STRIPE_SECRET_KEY` | Legacy mailbox only | Server-only Stripe key for the separate recurring mailbox offer |
| `STRIPE_WEBHOOK_SECRET` | Legacy Stripe events only | Existing Stripe webhook signing secret |
| `NEXT_PUBLIC_APP_URL` | Production | Set to `https://mymailmarket.com` for checkout returns and preference links; use localhost for local development |
| `NEXT_PUBLIC_ALLOW_SIGNUP` | Optional | Set to `false` to hide registration; also disable sign-ups in Supabase Auth |

The Supabase service-role key, Resend key, PayPal secret, Paystack secret, Truehost API key, and webhook secrets are only read in server modules. Do not paste credentials into source files or commit `.env.local`.

## Combined subscriptions and credits

The public **Pricing** page (`/pricing`) displays the database-backed combined packages and offers PayPal and Paystack checkout before account creation. The payment email is used to link the verified purchase to the account. After provider-side payment verification, the customer creates an account and confirms that email; package activation and credit allocation happen once the authenticated email matches the purchase. Existing customers can sign in to claim a verified purchase. The authenticated **Subscription** page also offers package checkout for existing accounts.

Guest checkout requires all Supabase migrations in `supabase/migrations` applied in date order, including `202611120004_guest_subscription_checkout.sql`.

The four combined packages are:

| Package | Email sending | Verified email discovery | PayPal | Paystack |
| --- | ---: | ---: | ---: | ---: |
| BASIC | 5,000 credits | 50 credits | $5 | ₦6,000 |
| BRONZE | 10,000 credits | 100 credits | $15 | ₦18,000 |
| SILVER | 30,000 credits | 200 credits | $30 | ₦45,000 |
| PREMIUM | 50,000 credits | 1,000 credits | $50 | ₦65,000 |

Every package includes both services. Clients can pay with PayPal in USD or Paystack in NGN. The seeded Paystack prices are BASIC ₦6,000, BRONZE ₦18,000, SILVER ₦45,000, and PREMIUM ₦65,000; PayPal continues to use the configured USD prices. Package purchases activate only after provider verification/webhook processing. Package terms default to 30 days, are manually renewed, and can be changed by an administrator. The administrator can configure package prices for both providers, allowances, duration, enabled state, and whether unused credits expire or roll over. These fixed-term purchases do not create automatically recurring subscriptions. The separate monthly mailbox offer remains on legacy Stripe checkout and does not grant package credits.

Set the PayPal app environment and webhook ID, and configure its webhook URL as `https://mymailmarket.com/api/webhooks/paypal` for `PAYMENT.CAPTURE.COMPLETED`. Configure `https://mymailmarket.com/api/webhooks/paystack` for Paystack's `charge.success` event. Paystack webhook signatures are verified using `PAYSTACK_SECRET_KEY`; no separate webhook secret is required. The server verifies each payment's status, reference, amount, and currency before activation; browser return URLs alone never grant credits. Use the provider's sandbox/test keys and a public tunnel for local webhook testing.

Email campaigns reserve one sending credit per eligible recipient; each test send costs one. Company discovery, domain email search, and individual email verification reserve discovery credits based on the number of requested/returned results. Unused reservation amounts are released after a successful operation, and failed provider/database operations release the reservation. Credit changes are atomic, ledgered, and cannot make a balance negative.

Provider transaction references and payment events are handled idempotently. Review refunds in the relevant provider dashboard and reconcile credits or subscription status in **Administration**; refunds do not automatically revoke shared balances.

To grant platform administration, set the authenticated user's **app_metadata** in Supabase Auth to include `{"role":"admin"}`. Do not put this claim in user-editable metadata. The `/admin/subscriptions` UI and its API require this server-verified claim; credit changes use database functions that independently verify it. Admin account suspension/deactivation also bans the Supabase Auth account; activation removes that ban.

## Verified lead data

The public **Lead data** page (`/lead-data`) sells verified email lead files in four packages (10,000 / 30,000 / 50,000 / 100,000 leads), priced in USD for PayPal and NGN for Paystack. Packages live in `lead_data_packages` (seeded by `supabase/migrations/202611140002_lead_data_orders.sql`) and can be repriced or disabled there.

Buyers enter a delivery email and optional targeting, then pay with the PayPal Smart Buttons or the Paystack popup. The server confirms every payment with the provider (on return and by webhook) and checks the amount and currency before marking the order **paid**. Paid orders appear under **Administration → Lead data orders**, where an administrator delivers the file and marks the order delivered (or refunded after refunding it in the provider dashboard). Set `ORDER_FROM_EMAIL` (and optionally `ORDER_NOTIFICATION_EMAIL`) to email buyers a confirmation and alert your team.

## Legacy mailbox subscription

The public homepage at `/` presents MYMAILMARKET's lead discovery, email marketing, hosting, and domain services. The separate `/domains/buy` page checks availability and provider quotes through Truehost and applies a 30% service markup. USD/NGN conversions use indicative ExchangeRate-API rates, cached for one hour. Domain checkout and registration are not enabled. Hosting purchases are available at `https://my.mymailmarket.com/client/store`. The homepage also offers a separate recurring mailbox subscription for **$5 USD per month**. This standalone legacy offer still uses Stripe Checkout and does not affect the combined package subscriptions.

The standalone mailbox checkout still requires `STRIPE_SECRET_KEY`; package checkouts use PayPal or Paystack. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` locally and `https://mymailmarket.com` in production.

## Business prospecting

The authenticated workspace includes **Prospecting** at `/leads` and uses Hunter for discovery:

- **Hunter Discover:** natural-language company search using Hunter's documented `POST /v2/discover` API. It returns matching companies and domains (up to five per request in this app); it does not return their contact emails.
- **Hunter Domain Search:** look up business email addresses for a discovered or manually entered company domain using Hunter's documented `GET /v2/domain-search` API. Newly found leads are deduplicated and stored per user.
- **Hunter Email Verifier:** verify saved addresses individually using Hunter's documented Email Verifier API.

Hunter API requests run server-side with the `X-API-KEY` header; the key is never exposed to the browser. Hunter may apply plan, credit, or rate limits. Fit scores are heuristics, not AI predictions. This app no longer uses its in-house website crawler.

Before using prospecting, apply `supabase/migrations/202611090001_lead_prospecting.sql` in the same Supabase project as the initial migration and set `HUNTER_API_KEY` in `.env.local` or the server environment. The table has per-user Row Level Security. Prospect records are not consented subscribers and are never automatically added to a campaign audience; obtain and record an appropriate legal basis/consent before campaign use.

## Resend integration

Resend has deprecated **Audiences** in favor of **Segments**. MYMAILMARKET creates and syncs Resend Segments for contact groups, creates API-owned Resend Broadcasts, and uses Resend's documented `RESEND_UNSUBSCRIBE_URL` placeholder in every marketing email. Resend's unsubscribe action updates its contact subscription state; the `contact.updated` webhook synchronizes that state to MYMAILMARKET. Bounce and complaint webhook events also suppress the corresponding local contacts.

The webhook endpoint verifies the original request body with Resend's SDK and the endpoint signing secret. Configure these events in the Resend dashboard:

- `email.sent`, `email.scheduled`, `email.delivered`, `email.delivery_delayed`
- `email.bounced`, `email.complained`, `email.opened`, `email.clicked`
- `email.failed`, `email.suppressed`, `contact.updated`, `suppression.added`

Webhook IDs are stored with a unique constraint for idempotent processing. `email.sent` means Resend accepted the individual message; it does **not** mean delivery. Delivered, open, and click metrics are recorded from their corresponding verified events. Open tracking is approximate and can be affected by Apple Mail Privacy Protection, image proxying, and other client behavior.

Campaign schedules are submitted to Resend as `scheduledAt` values and are executed by Resend server-side. The `scheduled_jobs` table is local schedule tracking, not a browser timer or a Vercel Cron worker. Resend's Broadcast cancel endpoint is used to cancel or replace a scheduled campaign.

Test emails use Resend's email send API. Campaign broadcasts use the Broadcast API. API errors are shown to the user; failed requests remain drafts and can be retried. Sending is guarded by a conditional database status update to avoid duplicate concurrent sends.

## Data, consent, and security

- Supabase is the canonical store for profiles, contacts, audiences, campaigns, templates, recipient snapshots, analytics events, and activity logs.
- Treat Resend Segments created by MYMAILMARKET as app-managed groups; avoid adding unrelated contacts to those Segments directly in Resend, because Broadcasts send to the provider Segment.
- Row Level Security policies restrict application records to their owner. Webhook processing uses the service-role key only after signature verification.
- CSV imports are added to the contact list as `pending_consent`, with no consent timestamp, and are not synced to Resend. They are excluded from campaign sends and audience sync; record valid consent before adding anyone as subscribed. Imports accept up to 500 records per request and process larger files in batches. Apply `supabase/migrations/202611100001_pending_consent_contacts.sql` to add the pending-consent status.
- A contact can have multiple email addresses. Apply `supabase/migrations/202611110001_contact_email_addresses.sql`; subscription, consent, Resend identity, and suppression are tracked per email address. Campaigns and audience counts include only subscribed addresses with recorded consent.
- Unsubscribed, bounced, and complained contacts are excluded from local recipient counts. Resend also applies its own suppression list to Broadcasts.
- A company mailing address in **Settings** is required before marketing sends. Configure a verified sender domain in Resend.
- Senders are restricted: a campaign or test email can only use a `from` address on `DEFAULT_SENDER_DOMAINS` or on a domain an administrator granted that user (**Administration → Approved sender domains**, stored in `sender_domain_grants`). Test emails can only go to the account's own email or an address on an approved domain.
- Broadcasts are sent to the whole Resend Segment, so every send and every audience sync reconciles the Segment first: missing eligible addresses are added and anyone no longer eligible (unsubscribed, deleted, moved to another audience, or without consent) is removed. A send is aborted if an ineligible contact cannot be removed. Credits are charged only for addresses actually in the Segment and not unsubscribed at Resend.
- Resend contacts and suppressions are account-wide. Because all workspaces share one Resend account, an unsubscribe, bounce, or complaint for an address applies to every workspace that holds that address, which mirrors what Resend itself enforces.
- The deployment's Resend API key is shared by workspaces in that installation. For a public multi-tenant SaaS where customers supply separate Resend accounts, implement encrypted per-tenant credentials and stricter provider-account isolation before onboarding external customers.

## Production safeguards

- **Server-only credit settlement.** Clients can reserve (spend) their own credits, but settling and refunding reservations runs only with the service role (`server_settle_service_credit_reservation`, `server_refund_service_credit_reservation`). The original client-callable functions are revoked.
- **Server-managed campaign state.** Clients may edit campaign content while it is a draft or scheduled, but `status`, `resend_broadcast_id`, `scheduled_at`, `sent_at`, and `credit_reservation_key` can only be written by the server. Campaign analytics (`campaign_events`) are read-only for clients.
- **Rate limiting.** A Postgres-backed limiter (`consume_rate_limit`) protects public checkout, payment verification, domain search, campaign sends, test sends, and audience syncs. If the limiter is unavailable it fails open and logs an error.
- **Security headers.** HSTS, `X-Frame-Options: DENY`, `nosniff`, a referrer policy, a permissions policy, and a conservative CSP (`frame-ancestors`, `base-uri`, `object-src`) are set in `next.config.ts`.
- **Health check.** `GET /api/health` returns `200` when the database is reachable and `503` otherwise. Point an uptime monitor at it.

All of the above require `supabase/migrations/202611140001_production_hardening.sql`.

## Deployment to Vercel (recommended)

Use Vercel Pro (campaign sends and audience syncs run for up to 300 seconds while reconciling large Resend Segments) and Supabase Pro (daily backups and point-in-time recovery).

1. **Repository.** Commit, push to a private GitHub repository, and protect `main`. The included GitHub Actions workflow (`.github/workflows/ci.yml`) runs type checking, lint, tests, a production dependency audit, and a build on every pull request.
2. **Environments.** Use separate Supabase projects (and PayPal sandbox / Paystack test keys) for Preview/staging, and live keys only for Production.
3. **Database.** Apply every file in `supabase/migrations` in order, preferably with the Supabase CLI so applied migrations are tracked:

   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

4. **Vercel project.** Import the repository, select Node.js 20+, and add all variables from `.env.example` for each environment. Set `NEXT_PUBLIC_APP_URL=https://mymailmarket.com`, `PAYPAL_ENVIRONMENT=live`, and `DEFAULT_SENDER_DOMAINS`. Keep service-role, provider, webhook, Resend, Hunter, and Truehost secrets server-only (never `NEXT_PUBLIC_`).
5. **Domain and email authentication.** Attach `mymailmarket.com` in Vercel. In Resend, verify a dedicated sending subdomain (for example `mail.mymailmarket.com`) with SPF, DKIM, and a DMARC record, so campaign reputation does not affect your primary domain.
6. **Auth.** Add `https://mymailmarket.com/auth/callback` to Supabase Auth's redirect URLs, configure a custom SMTP provider for Supabase Auth emails (the built-in sender is heavily rate-limited), and decide whether public sign-up stays enabled (`NEXT_PUBLIC_ALLOW_SIGNUP` plus the Supabase setting).
7. **Webhooks.** Configure Resend at `https://mymailmarket.com/api/webhooks/resend`, PayPal at `https://mymailmarket.com/api/webhooks/paypal` (`PAYMENT.CAPTURE.COMPLETED`), and Paystack at `https://mymailmarket.com/api/webhooks/paystack` (`charge.success`). Send a test event from each dashboard.
8. **Administration.** Grant yourself `{"role":"admin"}` in Supabase Auth `app_metadata`, then grant each customer's verified sender domain under **Administration**.
9. **Launch checks** (see the checklist below), then add monitoring.

Vercel's normal Next.js build and deployment are sufficient; no custom cron job is needed for Resend-scheduled Broadcasts.

### Launch checklist

- [ ] `GET https://mymailmarket.com/api/health` returns `{"ok":true}`.
- [ ] A real PayPal and a real Paystack purchase activate the package and credits (signed-in, and guest checkout followed by claim).
- [ ] A test email sends from an approved domain, and is rejected from an unapproved domain or to an outside recipient.
- [ ] A campaign to a small audience sends; the activity log shows Segment additions/removals; delivered/opened events arrive via the webhook.
- [ ] Unsubscribing from the email updates the contact to `unsubscribed`.
- [ ] Scheduling, rescheduling, and canceling a campaign refunds credits correctly.
- [ ] Calling `refund_service_credit_reservation` or updating `campaigns.status` directly with a user session (Supabase REST + anon key) is rejected.
- [ ] Uptime monitoring on `/api/health` and the webhook endpoints; error tracking (for example Sentry) and alerts for repeated webhook failures.
- [ ] Resend bounce and complaint rates are watched (keep complaints below 0.1%).

## Deployment to cPanel

This application requires a Node.js server; it cannot be deployed as a static site. cPanel must provide **Setup Node.js App** with Node.js 20 or later and permit a persistent Passenger application. A `server.js` entry point is included for cPanel.

1. Create a Node.js application in cPanel with Node.js 20+, production mode, and an application root outside `public_html` (for example `mymailmarket-app`). Set the startup file to `server.js`.
2. Upload the project files to the application root. Do not upload `.env.local`, `.git`, `node_modules`, or `.next` from your local machine.
3. In the cPanel application terminal, run `npm ci` and then `npm run build`. The startup file uses cPanel's `PORT` environment variable.
4. Add the production environment variables from `.env.example` in cPanel's Node.js application settings. Set `NEXT_PUBLIC_APP_URL=https://mymailmarket.com` and the public Supabase URL/key. Keep service-role, Resend, payment-provider, and Truehost credentials server-side. Do not upload `.env.local` or put secrets in `public_html`.
5. Point `mymailmarket.com` to the cPanel application using the domain/application setup provided by your host, enable SSL, and restart the Node.js application.
6. In Supabase Auth, add `https://mymailmarket.com/auth/callback` to the allowed redirect URLs. Update provider webhook URLs to the production domain, run all required Supabase migrations, and verify sign-in, a test email, and payment callbacks.

Shared hosting may limit application memory, process lifetime, or outbound requests. Confirm those limits with the host. Domain search will continue to show an error until Truehost accepts the configured credentials; successful cPanel deployment does not fix a Truehost 401.

## Useful commands

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run check   # typecheck + lint + tests
npm run build
npm start
```

## Current scope

The editor includes draggable heading, text, image, button, divider, columns, social-link, and custom-HTML blocks, plus HTML editing, preview modes, and responsive email markup. Analytics are based on stored Resend webhook events; no production statistics are fabricated. Resend account-level provider configuration (API key, verified domains, and webhook creation) is managed through environment settings and the Resend dashboard.
