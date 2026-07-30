# SHRISH Accounting Studio

Local browser app for sorting SHRISH bank activity and preparing CPA-friendly reports.

## Run locally

From the repository root:

```powershell
python -m http.server 4174 --bind 127.0.0.1 --directory .
```

Open:

```text
http://127.0.0.1:4174/accounting/index.html
```

## Workflow

1. Export activity from Chase as CSV.
2. Open the local app and click `Import Chase CSV`.
3. Review auto-categorized transactions.
4. Add category rules for repeated vendors or income streams.
5. Mark non-business or transfer rows using the `Business` checkbox.
6. Use `Export Excel` for an Excel-readable CPA packet.
7. Use `Print PDF` and choose `Save as PDF` for annual reports.

## Current default rules

- Incoming Zelle/QuickPay activity is categorized as `Sales - Shrish Mango`.
- Outgoing Zelle/QuickPay activity is categorized as `Vendor Payments - Zelle`.
- Outgoing descriptions containing `JGJ` are categorized as `Vendor Payments - JGJ`.
- Bank fees, debit card expenses, ACH credits, and ATM deposits get starter categories.

Bank exports and generated reports should stay local. `.gitignore` already excludes common copied Chase activity files and local accounting data/export folders.
