# Stripe payment setup – detailed walkthrough

This guide walks you through enabling **real card payments** for Pathwise, from creating a Stripe account to testing locally and going live on Fly.io.

---

## Part A: Create a Stripe account

### A1. Open the sign-up page

1. In your browser, go to: **https://dashboard.stripe.com/register**
2. You’ll see Stripe’s sign-up form (email, full name, country, password).

### A2. Fill out the form

1. **Email** – Use an email you can access (Stripe may send a verification link).
2. **Full name** – Your name or your business name.
3. **Country** – Choose the country where you (or your business) are based. This affects which currencies and payment methods you can use.
4. **Password** – Create a strong password and confirm it.
5. Click **Create account**.

### A3. Verify your email (if Stripe asks)

1. Check the inbox for the email you used.
2. Open the email from Stripe and click the verification link.
3. You’ll be taken back to the Stripe Dashboard.

### A4. You’re in the Dashboard

- The main Stripe Dashboard shows an overview (payments, balance, etc.).
- For setup we only need **Developers** (for API keys and webhooks). You don’t need to add a bank account or turn on live mode until you’re ready to accept real money.

---

## Part B: Get your API keys (test mode)

Test mode lets you run payments without moving real money. Always start here.

### B1. Open the API keys page

1. In the Stripe Dashboard, look at the **top right** of the page.
2. Find the **“Developers”** link and click it.
3. In the left sidebar, click **“API keys”**.
4. You should see a page titled **API keys** with two keys: **Publishable key** and **Secret key**.

### B2. Turn on Test mode

1. At the **top right** of the same page, look for a toggle that says **“Test mode”**.
2. If it’s **off** (grey), click it so it turns **on** (often orange or blue). The page may refresh.
3. When Test mode is on, the keys will start with:
   - **Publishable:** `pk_test_...`
   - **Secret:** `sk_test_...`

We only need the **Secret key** for this app.

### B3. Copy your Secret key

1. Find the row labeled **“Secret key”**.
2. The key is hidden by default. Click **“Reveal live key”** or **“Reveal test key”** (wording depends on Test mode).
3. The key will appear (e.g. `sk_test_51ABC...`). Click the **copy** icon next to it, or select the whole string and copy it (Ctrl+C / Cmd+C).
4. **Important:** Never share this key or commit it to Git. The app will read it from environment variables only.

You’ll paste this into your `.env` file in the next part.

---

## Part C: Set up and test locally

You’ll add the key to a `.env` file, start your app, and run a test payment on your machine.

### C1. Open your project folder

1. Open File Explorer (Windows) or Finder (Mac).
2. Go to the folder that contains your Pathwise app – the same folder where you see **server.js**, **package.json**, and the **public** folder.
   - Example: `C:\Users\jiayu\questionnaire-app` or `C:\Users\jiayu\questionnaire-app`
3. Optional: Open this folder in your code editor (e.g. Cursor/VS Code) so you can edit files there.

### C2. Create or edit the `.env` file

1. In that **same folder** (next to server.js), look for a file named **`.env`**.
   - If you don’t see it, it may be hidden: in Windows (File Explorer → View → check “Hidden items”); in VS Code/Cursor it usually still shows in the file list.
2. **If `.env` doesn’t exist:**  
   - Right-click in the folder → New → Text Document (or create a new file in your editor).  
   - Name it exactly **`.env`** (with the dot at the start, no .txt at the end).  
   - If Windows won’t let you name it `.env`, create it from your editor and save as `.env` in the project root.
3. **Open `.env`** in your editor (don’t double-click if it opens in Notepad; use Cursor/VS Code for clarity).

### C3. Add the Stripe variables to `.env`

1. In `.env`, add these two lines. **Replace** `sk_test_xxxx` with the Secret key you copied in Part B (paste it in place of the x’s):

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
APP_URL=http://localhost:3001
```

2. Notes:
   - No spaces around the `=` sign.
   - No quotes around the values (unless your key or URL contains spaces, which they usually don’t).
   - `APP_URL` must be exactly `http://localhost:3001` for local testing (your app will tell Stripe where to redirect after payment).
3. Save the file (Ctrl+S / Cmd+S).

If you already have other variables in `.env` (e.g. `MONGODB_URI`, `SESSION_SECRET`), leave them there and just add these two lines.

### C4. Start your app

1. Open a terminal (PowerShell, Command Prompt, or the integrated terminal in Cursor).
2. Go to your project folder, for example:

   ```powershell
   cd C:\Users\jiayu\questionnaire-app
   ```

3. Start the server:

   ```powershell
   npm start
   ```

4. You should see something like: `Server running on http://0.0.0.0:3001` (or similar). Leave this terminal open.

### C5. Open the app in the browser

1. Open your browser (Chrome, Edge, Firefox, etc.).
2. In the address bar type: **http://localhost:3001** and press Enter.
3. You should see the Pathwise home page.

### C6. Log in or create an account

1. Click **Login** (or “Sign up” if you don’t have an account yet).
2. If signing up: choose a username and password, then log in. If you already have an account: enter your username and password and log in.
3. After login you should be back on the home page with your name or “Logout” visible.

### C7. Go to the payment page

1. On the home page, click **“Plans”** in the navigation (or go directly to **http://localhost:3001/payment**).
2. You should see the **Premium Plan** (e.g. $100 one-time).
3. Click the button **“Proceed to Payment”**.
4. You’ll land on the **Complete Your Payment** page with an order summary (Plan, Amount, Total) and a **“Complete Payment”** button.

### C8. Start a test payment

1. Click **“Complete Payment”**.
2. **Expected:** The page may show “Confirming…” or “Processing…” briefly, then your browser should **redirect** to a Stripe-hosted page (URL will contain `checkout.stripe.com`). That means your app created a Checkout Session and sent you to Stripe correctly.
3. **If you see an error** (e.g. “Stripe is not configured” or a 503):  
   - Stop the server (Ctrl+C in the terminal), check that `.env` has `STRIPE_SECRET_KEY=sk_test_...` with no typos, save, and run `npm start` again.  
   - Make sure you didn’t put the key in quotes or add extra spaces.

### C9. Pay with a test card on Stripe’s page

On the Stripe Checkout page:

1. **Email** – Use any email (e.g. test@example.com).
2. **Card number** – Type: **4242 4242 4242 4242** (Stripe’s test card for a successful payment).
3. **Expiry** – Any future date, e.g. **12** / **34** (December 2034).
4. **CVC** – Any 3 digits, e.g. **123**.
5. **Name on card** – Any name, e.g. Test User.
6. **Country** – Choose any.
7. Click **“Pay”** (or “Subscribe” / “Confirm”, depending on Stripe’s wording).

No real money is charged in test mode.

### C10. Return to your app

1. After you click Pay, Stripe processes the payment and then **redirects** you back to your app.
2. The URL should be something like: **http://localhost:3001/payment-success.html?session_id=cs_test_...**
3. The page should show **“Payment successful”** and a button like **“Go to Questionnaire”**.
4. Click **“Go to Questionnaire”** (or open the home page). You should now see **“Counselor”** in the nav and no longer be asked to pay – your account is marked paid.

If you see all of that, **Stripe is set up correctly for local testing.**

---

## Part D: Set up on Fly.io (production)

Once local testing works, you can enable payments on your live site on Fly. You’ll set **secrets** (environment variables) on Fly and redeploy.

### D1. Confirm your app is deployed

1. You should have already run `fly launch` and `fly deploy` at least once so your app is on Fly.
2. In a terminal, from your project folder, run:

   ```powershell
   fly status
   ```

   You should see your app name and at least one machine. If not, run `fly deploy` first.

### D2. Know your Fly app URL

1. Your app’s public URL is usually: **https://&lt;your-app-name&gt;.fly.dev**
2. For this guide we’ll assume **questionnaire-app**, so the URL is **https://questionnaire-app.fly.dev**. Replace with your actual app name if different (you can see it in `fly.toml` as `app = '...'` or in the output of `fly status`).

### D3. Get your **live** Stripe Secret key (when ready for real payments)

1. In Stripe Dashboard, go to **Developers** → **API keys** again.
2. **Turn Test mode OFF** (toggle in the top right). The keys will switch to **live** (e.g. `sk_live_...`).
3. Click **Reveal** next to the **Secret key** and copy it.
4. **Important:** Live keys move real money. Keep them secret and only use them in Fly secrets, never in code or in Git.

If you want to test on Fly **without** real money first, you can use your **test** key (`sk_test_...`) on Fly as well; then switch to the live key when you’re ready to accept real payments.

### D4. Set Fly secrets

1. Open PowerShell (or your terminal) and go to your project folder:

   ```powershell
   cd C:\Users\jiayu\questionnaire-app
   ```

2. Set the Stripe secret key (use **live** key for real payments, or **test** key for testing on Fly):

   ```powershell
   fly secrets set STRIPE_SECRET_KEY="your_stripe_secret_key_here"
   ```

   Replace `sk_live_...` with your actual key. Use quotes so the shell doesn’t break on special characters.

3. Set the public URL of your app (no trailing slash):

   ```powershell
   fly secrets set APP_URL="https://questionnaire-app.fly.dev"
   ```

   Replace `questionnaire-app.fly.dev` with your real Fly app URL if it’s different.

4. Check that they’re set:

   ```powershell
   fly secrets list
   ```

   You should see `STRIPE_SECRET_KEY` and `APP_URL` (and any other secrets you set earlier, e.g. `MONGODB_URI`, `SESSION_SECRET`).

### D5. Redeploy

1. Redeploy so the new secrets are loaded:

   ```powershell
   fly deploy
   ```

2. Wait until the deploy finishes (build and release).

### D6. Test on the live site

1. In your browser, go to **https://questionnaire-app.fly.dev** (or your Fly URL).
2. Log in with an account that exists in your production database.
3. Go to **Plans** → **Proceed to Payment** → **Complete Payment**.
4. You should be redirected to Stripe Checkout. If you used a **test** key on Fly, use test card 4242 4242 4242 4242; if you used a **live** key, a real card will be charged.
5. After payment, Stripe should redirect you to **https://...fly.dev/payment-success.html?session_id=...** and show “Payment successful,” and your account should be marked paid.

If that works, **Stripe is set up for production.**

---

## Part E: Add a webhook (recommended for production)

The webhook lets Stripe notify your server when a payment succeeds, so the user is marked paid even if they close the browser before the success page loads.

### E1. Open Webhooks in Stripe

1. In Stripe Dashboard, go to **Developers** → **Webhooks** (left sidebar).
2. Click **“Add endpoint”** (or “Add an endpoint”).

### E2. Enter your endpoint URL

1. In **Endpoint URL**, type:

   ```text
   https://questionnaire-app.fly.dev/api/payment/webhook
   ```

   Replace `questionnaire-app.fly.dev` with your actual Fly app URL. There is no trailing slash. The path must be exactly `/api/payment/webhook`.

### E3. Select the event

1. Under **“Events to send”** or **“Select events”**, click **“Select events”** (or “Add events”).
2. In the list, find **“Checkout”** or **“checkout.session.completed”**.
3. Check the box for **“checkout.session.completed”**.
4. Confirm or click **“Add events”** / **“Add endpoint”**.

### E4. Create the endpoint

1. Click **“Add endpoint”** (or “Create endpoint”) at the bottom.
2. Stripe will show the new webhook’s page with a **Signing secret**.

### E5. Copy the Signing secret

1. On the webhook’s page, find **“Signing secret”** (or “Webhook signing secret”).
2. Click **“Reveal”** or **“Click to reveal”**.
3. Copy the value; it starts with **`whsec_...`**. You’ll add it to Fly in the next step.

### E6. Set the webhook secret on Fly

1. In your terminal, from the project folder:

   ```powershell
   fly secrets set STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxxxxxxxxxx"
   ```

   Paste your real `whsec_...` value in place of the x’s. Keep the quotes.

2. Redeploy:

   ```powershell
   fly deploy
   ```

After this, when a customer completes a payment, Stripe will send a `checkout.session.completed` event to your `/api/payment/webhook` URL. Your server will verify the signature with `STRIPE_WEBHOOK_SECRET` and mark the user paid. This backs up the success-page flow so payments are not lost if the user closes the tab early.

---

## Part F: Quick reference and troubleshooting

### Environment variables summary

| Variable                 | Used for        | Local (.env)                          | Fly (secrets)                                  |
|--------------------------|-----------------|----------------------------------------|------------------------------------------------|
| STRIPE_SECRET_KEY        | Stripe API      | `STRIPE_SECRET_KEY=sk_test_...`        | `fly secrets set STRIPE_SECRET_KEY="sk_..."`   |
| APP_URL                  | Redirect URLs   | `APP_URL=http://localhost:3001`        | `fly secrets set APP_URL="https://...fly.dev"` |
| STRIPE_WEBHOOK_SECRET    | Webhook verify  | Optional                               | `fly secrets set STRIPE_WEBHOOK_SECRET="whsec_..."` |

### Stripe Dashboard quick links

- **API keys (test):** Dashboard → Developers → API keys (Test mode ON).
- **API keys (live):** Same page, Test mode OFF.
- **Webhooks:** Developers → Webhooks → Add endpoint.

### Common issues

- **“Stripe is not configured” or 503 when clicking Complete Payment**  
  - `STRIPE_SECRET_KEY` is missing or wrong.  
  - Local: check `.env` in the project root, no typos, restart server after changing `.env`.  
  - Fly: run `fly secrets list` and `fly secrets set STRIPE_SECRET_KEY="sk_..."` then `fly deploy`.

- **Redirect after payment goes to wrong URL or “page not found”**  
  - `APP_URL` must match what users see: `http://localhost:3001` locally, `https://your-app.fly.dev` on Fly (no trailing slash).  
  - Set it in `.env` locally and as a Fly secret for production, then redeploy.

- **Payment succeeds on Stripe but user not marked paid**  
  - Success page calls `/api/payment/verify-session`; if the user closes the tab before that loads, they might not get marked paid.  
  - Add the webhook (Part E) and set `STRIPE_WEBHOOK_SECRET` on Fly, then redeploy.  
  - Check Fly logs: `fly logs` for errors from `/api/payment/webhook` or verify-session.

- **Webhook returns 400 or 503**  
  - 400 often means wrong or missing `STRIPE_WEBHOOK_SECRET`, or wrong endpoint URL.  
  - 503 means Stripe isn’t configured on the server; ensure `STRIPE_SECRET_KEY` and (for webhook) `STRIPE_WEBHOOK_SECRET` are set and redeploy.

- **Test cards (Stripe)**  
  - Successful payment: **4242 4242 4242 4242**.  
  - More options: https://stripe.com/docs/testing#cards .

---

If you follow the steps in order (A → B → C for local, then D and E for production), you’ll have Stripe fully set up and tested before going live.
