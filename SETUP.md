# Shrish Firebase + Resend setup

## What is already wired
- `shop.html` now reads product price/availability from Firestore in real time.
- `index.html` homepage featured products also refresh from Firestore.
- `order.html` submits orders to Firestore.
- `admin.html` uses Firebase Auth email/password login and manages products/orders from Firestore.
- `functions/index.js` sends customer + admin emails through Resend when a new order is created.

## 1) Fill Firebase web config
Edit `firebase-config.js` and replace every `REPLACE_ME` value with your Firebase web app config.

## 2) Enable Firebase products
In your Shrish Firebase project enable:
- Authentication -> Email/Password
- Firestore Database
- Cloud Functions

## 3) Create admin login
In Firebase Authentication create a user manually with your admin email and password.

## 4) Deploy Firestore rules
From repo root:
```bash
firebase deploy --only firestore:rules
```

## 5) Deploy functions
Inside `functions/`:
```bash
npm install
```
Then set Resend secret:
```bash
firebase functions:secrets:set RESEND_API_KEY
```
Deploy functions:
```bash
firebase deploy --only functions
```

## 6) Set function environment vars (optional but recommended)
You can set these in your Firebase Functions environment or update defaults in `functions/index.js`:
- `SHRISH_FROM_EMAIL`
- `SHRISH_ADMIN_EMAIL`
- `SHRISH_SUPPORT_PHONE`
- `SHRISH_INSTAGRAM_URL`
- `SHRISH_WHATSAPP_URL`

## 7) Verify Resend domain
In Resend:
- add your sending domain
- verify DNS
- use that verified sender in `SHRISH_FROM_EMAIL`

## 8) Push website changes
Push the website files to GitHub Pages. The site stays static, but live data now comes from Firebase and emails are sent by Firebase Functions.

## 9) First admin login behavior
On first successful admin login, the page seeds your current product catalog into Firestore automatically if the `products` collection is empty.

## Notes
- Cart still uses `sessionStorage` only for the current shopper session, which is fine.
- Orders are no longer stored in browser `localStorage`.
- Product price/availability is no longer controlled by browser `localStorage`.
