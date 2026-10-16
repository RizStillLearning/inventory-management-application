# Stockroom: inventory management on Supabase

A React + TypeScript single-page app for tracking products, stock levels, and every stock movement. Data lives in Supabase (Postgres + Auth + Realtime). It runs in the browser or as an Electron desktop app (see [Desktop app](#desktop-app)).

## Features

- **Dashboard**: stock value, units on hand, low and out-of-stock counts, stock value by category, a reorder list with one-click "Receive", and recent activity.
- **Products**: search, filter by category, supplier, or stock status, sortable columns, CSV export, and add/edit/delete. On phones the table becomes a list of cards.
- **Stock movements**: *Receive*, *Ship*, or *Count* (set on-hand to a counted number). Each one is written to an append-only ledger that records who made the change and the resulting balance.
- **Product drawer**: details, quick stock actions, and recent history for one product.
- **Stock history**: the full ledger, filterable by product, type, and date range, with CSV export.
- **Categories & suppliers**: CRUD, showing product counts, stock value, and how many products need reordering.
- **Live updates**: when stock changes in another window or on another device signed in to the same account, the app refreshes (Supabase Realtime).
- **Email/password sign-in**. Every account has its own private inventory, and a new account starts empty. Anonymous visitors can't read or write anything.

## How stock stays correct

`products.quantity` is never written directly. The browser inserts a row into `stock_movements`, and a database trigger applies it to the product in the same transaction. Postgres enforces the rules, so they hold no matter what a client sends:

- Quantity can't go below zero. A shipment larger than what's on hand is rejected, even when two people ship at the same moment.
- Signed-in users have no privilege to update `products.quantity`, or to edit or delete ledger rows.
- `created_by` and `created_by_email` are filled in from the user's login token and can't be faked.
- Every row has an `owner_id`, also filled in from the login token. Row level security limits each account to its own rows. A product can only use categories and suppliers from the same inventory, and stock movements only apply to the account's own products.

## Setup

### 1. Create the database

1. Create a project at [supabase.com](https://supabase.com) (the free tier is fine).
2. In the dashboard, open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Optional: run [`supabase/seed.sql`](supabase/seed.sql) the same way to load sample categories, suppliers, products, and history. The samples go into one account's inventory, so sign up in the app first and put that account's email at the top of the file.

Both scripts are safe to run more than once.

**Upgrading a database from before each account had its own inventory:** run the new `schema.sql` again. Its existing rows become the inventory of the admin account named in the script's upgrade block (`harrisk2606@gmail.com`), and every other account starts empty. That account must already exist. If it doesn't, the script stops without changing anything.

### 2. Configure auth

Under **Authentication → Sign In / Providers**, email sign-in is enabled by default. For local development, pick one:

- Turn off **Confirm email**, so new accounts can sign in right away, **or**
- Under **Authentication → URL Configuration**, set **Site URL** to `http://localhost:5173` (and add it to **Redirect URLs**), so the confirmation link brings you back to the app.

### 3. Connect the app

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are in your project under **Connect** (top bar) or **Project Settings → API Keys**. Use the **publishable** key (`sb_publishable_...`) or the legacy **anon** key. Never use the secret/service_role key: anything in `.env` is shipped to the browser.

To change how money is displayed, set `VITE_CURRENCY` (default `USD`). You can also set `VITE_LOCALE` and `VITE_CURRENCY_DECIMALS`. For example, to show Indonesian Rupiah as "Rp 15.000":

```
VITE_CURRENCY=IDR
VITE_LOCALE=id-ID
VITE_CURRENCY_DECIMALS=0
```

### 4. Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, create an account, and sign in.

> Requires Node 22.12 or newer, which Electron and its build tools need.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check and build static files into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check the app and the Electron main process |
| `npm run electron:dev` | Open the desktop app against the dev server, with hot reload |
| `npm run electron:build` | Build the desktop installers into `release/` |

## Deploying

`npm run build` produces a static site in `dist/` that any static host can serve (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3). Set the same `VITE_*` environment variables in the host's build settings, then add the deployed URL to **Authentication → URL Configuration → Redirect URLs** in Supabase.

## Desktop app

The same app runs as an Electron desktop app. It talks to the same Supabase project, so an account sees the same inventory on the desktop and in the browser, with changes showing up live in both.

### Develop

```bash
npm run electron:dev
```

This starts the Vite dev server and opens the app in a desktop window. Changes under `src/` hot-reload in the window. Changes to `electron/main.ts` need a restart: close the window and run the command again.

### Build installers

```bash
npm run electron:build
```

Installers land in `release/`. Build on the system you are targeting:

| Built on | Output |
|---|---|
| Linux | `Stockroom-<version>.AppImage` and `inventory-management_<version>_amd64.deb` |
| Windows | `Stockroom Setup <version>.exe` |
| macOS | a `Stockroom-<version>…dmg` disk image |

On Ubuntu, install the `.deb` (`sudo apt install ./release/inventory-management_*.deb`). It adds Stockroom to the app launcher and sets up the AppArmor profile that Ubuntu 24.04+ needs for Electron's sandbox. To run the AppImage instead, install FUSE 2 first: `sudo apt install libfuse2t64`.

The installers aren't code-signed, so Windows SmartScreen and macOS Gatekeeper warn on first launch. Sign them before handing them to other people.

### Things to know

- **`.env` is baked in at build time.** The Supabase URL, key and currency settings are compiled into the app, so rebuild after changing `.env`. Use the publishable/anon key only, as for the web build.
- **Email confirmation.** A confirmation link opens in the user's browser, not the desktop app. The link still confirms the account, and the user then signs in in the app. To skip this step, turn off **Confirm email** in Supabase. Otherwise, point **Site URL** at a page that makes sense to land on.
- **Sign-in is remembered** per computer, in the app's data folder (for example `~/.config/Stockroom` on Linux).
- **Title bar.** The window draws its own title bar with minimize, maximize and close buttons, so they appear even on desktops like GNOME that show only a close button by default. On macOS the usual traffic-light buttons stay on the left. The title bar is a separate page from the app, so the buttons keep working while a dialog is open. Press F11 (or **View → Toggle Full Screen**) for full screen.
- **Security.** The built app is served from a private `app://stockroom/` origin with a Content Security Policy. Pages have no Node.js access, and links to other sites or `mailto:` open in the system browser or mail app.

## Project layout

```
electron/
  main.ts               desktop window, app:// protocol, CSP, external links, menu
  titlebar.html         the window's title bar and its minimize/maximize/close buttons
  titlebar-preload.cts  connects the title bar buttons to the window
build/
  icon.png              desktop app icon for Windows and macOS (electron-builder makes .ico/.icns from it)
  icons/                the same icon at the standard Linux sizes, 16x16 to 512x512
scripts/
  electron-dev.js       runs Vite + Electron together for npm run electron:dev
supabase/
  schema.sql            tables, stock trigger, privileges, row level security, realtime
  seed.sql              optional sample data
src/
  lib/
    supabase.ts         client setup from .env
    api.ts              all database calls + friendly error messages
    inventory.tsx       shared store for products/categories/suppliers + realtime refresh
    router.ts           tiny hash router (#/products?status=low)
    format.ts           money/number/date formatting, stock status, CSV export
    types.ts            row types
  components/           Modal, toasts & confirm dialog, product form, stock form, drawer, layout
  pages/                Dashboard, Products, Movements, Categories, Suppliers, Auth, Setup
  styles.css            design tokens (light + dark) and all styles
```
