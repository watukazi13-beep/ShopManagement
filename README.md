# Shop Manager

Made by **Greenlight Stationeries** · Author: **Michael Kepha**

A simple app for running a shop: sell, keep stock, record expenses, and see your real monthly profit.
It works on phone, tablet and computer, keeps working with no internet, and syncs when the connection comes back.
Only people you give access to can open it. Hosting and sync are free.

**What it does**

- **Sell** — tap items or scan a barcode, take payment (Cash, M-Pesa, Tigo Pesa, Airtel Money, Card, Credit), work out change, print or WhatsApp the receipt.
- **Stock** — every sale and delivery updates stock automatically. Average cost is recalculated each time you receive stock at a new price.
- **Low stock alerts** — a red badge, an alert list on Home, and a phone notification when an item runs low.
- **How much to reorder** — based on how fast each item sold in the last 30 days, your supplier's delivery time, and how many days of stock you want. You can also set your own low level and "fill up to" level per item.
- **Requests for quotation (RFQ)** — drafted for each supplier with the quantities needed. Created automatically on the first day you open the app each month, or any time you tap "Create". Send by WhatsApp, email, or print/save as PDF. When goods arrive, one tap turns the request into a stock delivery.
- **Monthly profit** — Sales − Cost of goods sold = Gross profit; minus expenses and stock losses = Net profit. Profit per item, payment method totals, and a 6‑month comparison. Print or export to CSV.
- **People** — Owner, Manager (everything except managing people) and Seller (sell and view stock only — no costs or profit).
- **Import from Loyverse** — export your item list from Loyverse and import the CSV in one step.

---

## One-time setup (about 15 minutes)

You need: this GitHub repository and a Google account. Everything below is on free plans — no card needed.

### 1. Turn on the website (GitHub Pages)

1. In this repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main` and folder `/ (root)`, then **Save**.
3. After a minute the app is live at **https://watukazi13-beep.github.io/ShopManagement/**

You can open it now and choose **Try it on this device first** to look around. That mode keeps data on one device only.

### 2. Create the free Firebase project (sync + sign-in)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with your Google account.
2. **Create a project** → name it (e.g. `my-shop`) → you can turn Google Analytics off → **Create**.
3. **Add a web app:** on the project home page click the **`</>`** (Web) icon → nickname `shop` → **Register app**. Leave Firebase Hosting unticked.
   Firebase shows a block of code with `const firebaseConfig = { apiKey: ..., ... }`. **Copy it** — you'll need it in step 6.
4. **Turn on Google sign-in:** left menu **Build → Authentication → Get started → Sign-in method → Google → Enable**, choose your support email, **Save**.
5. **Allow your website to sign in:** still in Authentication, open **Settings → Authorized domains → Add domain** and add `watukazi13-beep.github.io`.
6. **Create the database:** **Build → Firestore Database → Create database** → location **africa-south1 (Johannesburg)** (closest to East Africa) → **Start in production mode** → **Create**.
7. **Add the security rules:** in Firestore open the **Rules** tab, delete what's there, paste the whole content of [`firestore.rules`](firestore.rules) from this repository, and click **Publish**.

### 3. Connect the app to Firebase

Choose one:

- **Recommended — connect every device at once:** open [`js/config.js`](js/config.js) in this repository, click the pencil (Edit), paste the values from step 2.3 between the quotes, and **Commit changes**. (Or send the config to Claude and it will do it.)
- **Quick test on one device:** open the app, tap **Connect Firebase**, and paste the config.

The Firebase config is not a password — it only says *which* project to talk to. Your data is protected by Google sign-in and the security rules.

### 4. Claim your shop

1. Open the app and **Sign in with Google** using *your* account.
2. You'll be asked **"Make this account the owner?"** → **Yes, I am the owner**. Do this straight away, before sharing the link.
3. Go to **Settings** → fill in your shop name, phone and address (they appear on receipts and RFQs).
4. **Settings → People with access** → enter a staff member's Gmail address, pick **Seller** or **Manager**, tap **Give access**. They open the same link and sign in with that Google account.

### 5. Install it like an app

- **Android (Chrome):** open the link → ⋮ menu → **Install app** / **Add to Home screen**.
- **iPhone / iPad (Safari):** open the link → Share → **Add to Home Screen**.
- **Computer (Chrome / Edge):** click the install icon at the right of the address bar.

Open it once while online on each device so it can save itself for offline use.

### 6. Bring in your items from Loyverse

1. Loyverse Back Office → **Items → Item list → Export** → save the CSV.
2. In the app: **Stock → Import** → choose the file → **Import**.
   Name, category, SKU, barcode, price, cost, stock and low-stock level come across. Items with variants (e.g. sizes) become one item per variant. Suppliers named in the file are created too.
3. Check each item's **Usual supplier** (Stock → tap item → Edit) so quotation requests are grouped correctly.

---

## How the numbers are worked out

| Figure | Calculation |
|---|---|
| Sales (revenue) | Total of all sales in the month, after discounts. Cancelled sales are excluded. |
| Cost of goods sold (COGS) | For every item sold: quantity × the item's average cost *at the time of the sale*. |
| Average cost | When stock arrives: (old quantity × old cost + new quantity × new cost) ÷ total quantity. |
| Gross profit | Sales − COGS |
| Stock losses | Items removed as damaged, expired, lost or by a stock count, valued at cost (stock found in a count reduces the loss). |
| Net profit | Gross profit − expenses − stock losses |
| Low stock alert | When stock ≤ the higher of your **low stock level** and the sales expected during the supplier's delivery time. Out of stock is always alerted. |
| Reorder quantity | Fill up to your **"fill up to"** level, or (if not set) enough for delivery time + "order enough for" days at the recent sales rate; rounded up to the pack size. |

Delivery time (default 7 days), days to order for (default 30) and the sales period (default 30 days) are in **Settings → Restocking**.

## Good to know

- **Offline:** sales, deliveries, expenses and edits all work offline and upload automatically later. The sync dot at the top shows *Synced*, *Syncing…* or *Offline*. Signing in for the first time on a device needs internet.
- **Cost:** GitHub Pages and the Firebase free plan (Spark) cost nothing. The free plan allows 50,000 reads and 20,000 writes per day — plenty for a single shop (a sale with 3 items is about 4 writes). If you ever go over, Firebase pauses until the next day; it never charges you unless you add a card and upgrade.
- **Privacy:** this repository holds only the app's code. Your sales, stock and money data live in your Firebase project and are visible only to the people you allow.
- **Backups:** Settings → Download backup saves a copy of the data on that device. Money → Sales and Stock → Export give CSV files for Excel.
- **Alerts:** tap **Turn on alerts** in Settings to get phone notifications for low stock and for the monthly quotation requests. The app shows alerts when it is open or running in the background; it can't wake a closed phone (that needs a paid server).
- **iPhone note:** Google sign-in works best in Safari itself. If signing in from the home-screen app on iPhone fails, sign in from Safari instead.

## For developers

Plain HTML/CSS/JavaScript modules — no build step. Firebase is loaded from Google's CDN and cached by the service worker for offline use.

```
index.html, css/app.css, sw.js, manifest.webmanifest
js/app.js            start-up, sign-in gates, navigation
js/store.js          app state and every action that changes data
js/calc.js           pure business calculations (tested)
js/backend-*.js      Firebase (synced) and device-only storage
js/views/*.js        Home, Sell, Stock, Orders, Money, Settings
firestore.rules      database security rules
tests/               calculation tests and browser end-to-end tests
```

Run the tests:

```
node tests/calc.test.mjs
python3 -m http.server 8765 &
python3 tests/e2e.py            # device-only mode: selling, stock, costs, reports, RFQs, import, offline
python3 tests/e2e_firebase.py   # synced mode with a stand-in Firebase: owner, sellers, access
```

When you change app files, bump `VERSION` in `sw.js` so installed apps pick up the update.
