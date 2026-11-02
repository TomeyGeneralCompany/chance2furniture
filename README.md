# Chance 2 Furniture

Purple and teal storefront based on the approved All by Devoll design, with the supplied boar-and-lighthouse logo. Includes all 1,008 products retrieved from Office Crave's 42-page furniture catalog on November 2, 2026, product photos, search, category filters, sorting, pagination, and a shopping bag.

## Run locally

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. No JavaScript dependencies or build step.

## Pricing

**Retail price = (supplier product cost + supplier shipping cost) × 2.5**, rounded to cents.

Edit `dist/pricing-config.js`. Set supplier shipping by SKU in `supplierShippingBySku`, or set a known per-unit `defaultSupplierShipping`. Per-SKU values override the default, including an explicit zero for genuinely free supplier shipping. Missing shipping or product prices display **Request a quote** and cannot be added to the priced bag. No shipping amounts have been invented or treated as zero.

Supplier shipping charges can depend on destination, quantity, and freight service. The public catalog import does not obtain checkout shipping quotes. These inputs must come from your supplier quotes or a future shipping integration. Customer-facing shipping and tax are not yet calculated.

## Refresh the full catalog

```sh
python3 import_catalog.py
```

Python 3 and curl are required. The importer discovers the last page, fetches every page with bounded concurrency and retries, deduplicates by source URL, and updates both data files only after every page parses. A reduction exceeding 20% stops the update for review. Listing markup changes will require updating the parser. Product photos load from Office Crave.

A manual GitHub Actions workflow refreshes the catalog and commits data changes. It must be enabled/run in GitHub; no schedule is currently enabled.

## Hosting

`dist/` is the complete static website. For GitHub Pages, use the included deployment workflow after selecting **GitHub Actions** as the Pages source in repository settings. Deployment runs manually; uploading this repository alone does not activate a live store.

## Ordering status

Search, sorting, filtering, pagination, and the session shopping bag work. Checkout, payments, order transmission, live shipping quotations, and automatic supplier purchasing are not connected. The bag is a shopping list; it does not submit or charge an order. The site deliberately does not claim otherwise.

## Files

- `dist/index.html`: storefront markup
- `dist/styles.css`: approved responsive design
- `dist/app.js`: catalog and bag interactions, retail pricing formula
- `dist/catalog.json` and `dist/catalog.js`: complete imported catalog snapshot
- `dist/pricing-config.js`: multiplier and supplier shipping inputs
- `dist/logo.webp`: supplied Chance 2 logo
- `import_catalog.py`: repeatable full-catalog importer
- `.github/workflows/`: manual catalog refresh and Pages deployment
