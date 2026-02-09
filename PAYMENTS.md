# How to Get Payments Working

Pathwise uses an **account-based payment flag**: when a user "completes payment," the server marks their account as paid (no real card processing yet). For that to work reliably, you need the following.

## 1. Requirements

- **Users must be logged in** – Payment status is tied to the logged-in user.
- **Sessions must persist** – So the server knows who is logged in.
- **User data must persist** – So payment status is saved (especially on Fly, where the filesystem is ephemeral).

## 2. Set environment variables

### Local (`.env`)

```env
SESSION_SECRET=your-long-random-secret-at-least-32-chars
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/pathwise
```

- **SESSION_SECRET** – Required so login sessions work (use a long random string).
- **MONGODB_URI** – Required so users and their payment status are stored and survive restarts. Without it, on Fly your app may use a JSON file that is lost when the machine restarts.

### Production (Fly.io)

Set the same as **secrets** so they are not in your repo:

```powershell
fly secrets set SESSION_SECRET="your-long-random-secret"
fly secrets set MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/pathwise"
```

If you don’t set `MONGODB_URI` on Fly, user and payment data may not persist across deploys or restarts.

## 3. Flow (how payments “work”)

1. **Create an account** – Sign up (e.g. from the login page).
2. **Log in** – Use that account.
3. **Open Plans** – Click “Plans” (or go to `/payment`).
4. **Proceed to payment** – Click “Proceed to Payment” to go to the payment completion page.
5. **Complete payment** – Click “Complete Payment.” The server records `hasPayment: true` (and plan/date) for the **current user** in the database.

After that, the app treats that user as paid: they can access the questionnaire and Counselor, and “Plans” may be hidden in the nav.

## 4. If payment doesn’t seem to work

- **“Please log in” / 401** – You must be logged in. Log in, then go to Plans → Proceed to Payment → Complete Payment.
- **Payment doesn’t stick after refresh or restart** – User data isn’t persisting. Set **MONGODB_URI** (and use MongoDB Atlas or another persistent DB). On Fly, set it with `fly secrets set MONGODB_URI="..."`.
- **Session keeps dropping** – Set **SESSION_SECRET** (and in production ensure cookies are sent over HTTPS; the app already sets `secure` in production).

## 5. Real card payments (Stripe) – already integrated

The app supports **Stripe Checkout**: when configured, “Complete Payment” creates a Stripe Checkout Session and redirects the user to Stripe to pay. After payment, Stripe redirects to your success page and the user is marked paid.

### Stripe setup

1. **Create a Stripe account** at https://dashboard.stripe.com and get your API keys (Dashboard → Developers → API keys).
2. **Set environment variables** (local `.env` or Fly secrets):
   - `STRIPE_SECRET_KEY` – e.g. `sk_test_...` (test) or `sk_live_...` (live).
   - `APP_URL` – public URL of your app, e.g. `https://questionnaire-app.fly.dev` or `http://localhost:3001`. Used for Stripe redirect URLs.
   - `STRIPE_WEBHOOK_SECRET` – (optional but recommended) for reliable fulfillment. Create a webhook in Dashboard → Developers → Webhooks: endpoint URL `https://your-app.fly.dev/api/payment/webhook`, event `checkout.session.completed`; then set the signing secret (`whsec_...`) as `STRIPE_WEBHOOK_SECRET`.
3. **Redeploy** so the server uses the new env vars.

Flow:

- User clicks “Complete Payment” → server creates a Checkout Session → browser redirects to Stripe.
- User pays on Stripe → Stripe redirects to `/payment-success.html?session_id=...`.
- Success page calls `GET /api/payment/verify-session?session_id=...` → server marks the user paid.
- If you set `STRIPE_WEBHOOK_SECRET`, Stripe also sends `checkout.session.completed` to `/api/payment/webhook`; the server marks the user paid from the webhook too (more reliable if the user closes the browser before the success page loads).

If Stripe is **not** configured (`STRIPE_SECRET_KEY` not set), “Complete Payment” falls back to the old behavior: the user is marked paid without a real charge (for testing).
