# Connecting to the Technicon Services ERP

Decision D10. This app reads customers, products, quotations and customer orders from the ERP. It never
writes to the ERP and never connects to its database.

## Why a key and not a login

The ERP's login has two roles. `admin` can change everything, so storing that login here would put far
more power in this app than it needs. `staff` sees only the quotations it created, so it can't see the
data. The ERP therefore gets one small read-only route, opened by a key.

## What changes in the ERP

[erp-read-only-api.patch](erp-read-only-api.patch) adds one new file, shown in full as
[integration.js](integration.js), and two lines in `app/api/index.js` to mount it. No database change.

- Every route is GET, under `/api/integration/v1`: `/customers`, `/products`, `/quotations`, `/orders`.
- It returns only the columns this app needs: no costs, margins, notes or line prices.
- With `ERP_INTEGRATION_KEY` unset or under 32 characters, every route answers 404. So applying the patch
  alone exposes nothing.
- Suppliers and the company's own purchase orders are left out.

The patch was tested on a scratch copy of the ERP's `origin/main` code and schema, on a throwaway local
database. It has not run against the ERP's live database.

## Going live

These change the ERP and production, so each needs the owner's go-ahead.

1. Apply the patch on a new ERP branch, review it, and merge it.

   ```bash
   git apply erp-read-only-api.patch
   ```

2. Generate a key of at least 32 characters. Treat it like a password.

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

3. In the ERP's Vercel settings, set `ERP_INTEGRATION_KEY` to it.
4. In this app's server settings, set `ERP_API_URL` to the ERP's https address and `ERP_API_KEY` to the same
   key. Then open Admin → ERP sync and press Sync now.

To cut the connection at any time, remove `ERP_INTEGRATION_KEY` from the ERP. The app then keeps working on
the data it already has and shows the error on the ERP sync screen.

## How the sync behaves

- Every half hour, one request at a time. The ERP's database has few connections, so it never sends
  requests in parallel.
- **Customers:** linked automatically only when there is exactly one company with the same GSTIN or name.
  The rest wait on the ERP sync screen to be linked, added or set aside. Company details here aren't
  overwritten.
- **Products:** added or updated by part number, including name, make and key features. Products whose make
  isn't an OEM here are skipped and listed. Category and active/inactive stay as set here.
- **Quotations:** the office picks one from the ERP on the deal instead of retyping it. One already recorded
  by hand is matched by number, unless that number belongs to a different customer. From then on its
  number, date, amount and status follow the ERP and can't be edited here.
- **Orders:** shown on the deal. A deal is never closed by the sync, because closing needs a person's reason.
