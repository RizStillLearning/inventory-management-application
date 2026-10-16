# Stockroom: inventory management on Supabase

A desktop app for Ubuntu and Windows that tracks products, stock levels, and every stock movement. It's built with React, TypeScript and Electron, and keeps its data in Supabase (Postgres + Auth + Realtime). The same code also runs in a web browser.

To get started, [set up Supabase](#set-up-supabase), then follow [Install on Ubuntu](#install-on-ubuntu) or [Install on Windows](#install-on-windows).

## Features

- **Dashboard**: stock value, units on hand, low and out-of-stock counts, stock value by category, a reorder list with one-click "Receive", and recent activity.
- **Products**: search, filter by category, supplier, or stock status, sortable columns, CSV export, and add/edit/delete. In a narrow window the table becomes a list of cards.
- **Stock movements**: *Receive*, *Ship*, or *Count* (set on-hand to a counted number). Each one is written to an append-only ledger that records who made the change and the resulting balance.
- **Product drawer**: details, quick stock actions, and recent history for one product.
- **Stock history**: the full ledger, filterable by product, type, and date range, with CSV export.
- **Categories & suppliers**: CRUD, showing product counts, stock value, and how many products need reordering.
- **Live updates**: when stock changes in another window or on another device signed in to the same account, the app refreshes (Supabase Realtime).
- **Email/password sign-in**. Every account has its own private inventory, and a new account starts empty. Anonymous visitors can't read or write anything.

## How stock stays correct

`products.quantity` is never written directly. The app inserts a row into `stock_movements`, and a database trigger applies it to the product in the same transaction. Postgres enforces the rules, so they hold no matter what a client sends:

- Quantity can't go below zero. A shipment larger than what's on hand is rejected, even when two people ship at the same moment.
- Signed-in users have no privilege to update `products.quantity`, or to edit or delete ledger rows.
- `created_by` and `created_by_email` are filled in from the user's login token and can't be faked.
- Every row has an `owner_id`, also filled in from the login token. Row level security limits each account to its own rows. A product can only use categories and suppliers from the same inventory, and stock movements only apply to the account's own products.

## Set up Supabase

Every copy of the app connects to one Supabase project, and each person signs in with their own account. You do this once, before building the app.

### 1. Create the database

1. Create a project at [supabase.com](https://supabase.com) (the free tier is fine).
2. In the dashboard, open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Optional: run [`supabase/seed.sql`](supabase/seed.sql) the same way to load sample categories, suppliers, products, and history. The samples go into one account's inventory, so sign up in the app first and put that account's email at the top of the file.

Both scripts are safe to run more than once.

**Upgrading a database from before each account had its own inventory:** run the new `schema.sql` again. Its existing rows become the inventory of the admin account named in the script's upgrade block (`harrisk2606@gmail.com`), and every other account starts empty. That account must already exist. If it doesn't, the script stops without changing anything.

### 2. Configure sign-up emails

By default, Supabase emails new accounts a confirmation link before they can sign in. Pick one:

- Turn off **Confirm email** under **Authentication → Sign In / Providers**, so new accounts can sign in right away, **or**
- Keep it on, and under **Authentication → URL Configuration** set **Site URL** to a page that exists. The link opens in the person's browser and lands on that page. Their account is confirmed either way, and they then sign in in the app.

Supabase's built-in email service only sends to members of your Supabase team. To send confirmation emails to anyone else, set up your own email provider under **Authentication → Emails → SMTP Settings**.

### 3. Connect the app

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are in your project under **Connect** (top bar) or **Project Settings → API Keys**. Use the **publishable** key (`sb_publishable_...`) or the legacy **anon** key. Never use the secret/service_role key: everything in `.env` is built into the app.

To change how money is displayed, set `VITE_CURRENCY` (default `USD`). You can also set `VITE_LOCALE` and `VITE_CURRENCY_DECIMALS`. For example, to show Indonesian Rupiah as "Rp 15.000":

```
VITE_CURRENCY=IDR
VITE_LOCALE=id-ID
VITE_CURRENCY_DECIMALS=0
```

## Install the desktop app

You build the installer from this repository, then install it on as many computers as you like. Build it on the system it's for: the Ubuntu installer on Ubuntu, the Windows installer on Windows. (On a Mac, the same steps produce a `.dmg` disk image.)

Before you start, you need the Supabase project from [Set up Supabase](#set-up-supabase): the database created with `schema.sql`, plus the project URL and publishable key. The installer connects every copy of the app to that project, and each person signs in with their own account.

Already have an installer file from someone who built it? Skip to the install step for your system.

The file names below contain the version from `package.json` (`1.0.0` here).

### Install on Ubuntu

These steps were written for Ubuntu 24.04 and newer.

1. **Install Git, and check Node.js.** Open a terminal and run:

   ```bash
   sudo apt update
   sudo apt install -y git
   node -v
   ```

   `node -v` must print `v22.12.0` or newer. If it prints an older version or `command not found`, install Node.js from [nodejs.org/en/download](https://nodejs.org/en/download): pick Linux and nvm, and run the commands the page shows. Ubuntu's own `nodejs` package is often too old.

2. **Get the code and add your Supabase settings.**

   ```bash
   git clone https://github.com/RizStillLearning/inventory-management-application.git
   cd inventory-management-application
   cp .env.example .env
   nano .env
   ```

   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as described in [Connect the app](#3-connect-the-app). Save with Ctrl+O and Enter, then exit with Ctrl+X.

3. **Build the installer.** The first build downloads Electron and the packaging tools, so it takes a few minutes.

   ```bash
   npm install
   npm run electron:build
   ```

   This creates `release/inventory-management_1.0.0_amd64.deb` and `release/Stockroom-1.0.0.AppImage`.

4. **Install it.**

   ```bash
   sudo apt install ./release/inventory-management_1.0.0_amd64.deb
   ```

   Keep the `./` at the start: it tells apt to install a file instead of looking the name up online. The package installs into `/opt/Stockroom`, adds Stockroom to the app launcher, and sets up the AppArmor profile that Ubuntu 24.04 and newer need for Electron's sandbox.

5. **Open Stockroom.** Press the Super key, type **Stockroom**, and open it. To keep it in the dock, right-click its icon while it's running and choose **Pin to Dash**. Then sign in, or create an account.

**Without installing:** the AppImage runs from wherever you put it. It needs FUSE 2 (`sudo apt install -y libfuse2t64`; on Ubuntu 22.04 the package is `libfuse2`). Then run `./release/Stockroom-1.0.0.AppImage`. It doesn't add Stockroom to the app launcher.

**Update to a newer version:** in the project folder, run `git pull`, `npm install` and `npm run electron:build`, then install the new `.deb` the same way. If the version number didn't change, add `--reinstall`: `sudo apt install --reinstall ./release/inventory-management_1.0.0_amd64.deb`.

**Uninstall:** `sudo apt remove inventory-management`. Your sign-in stays in `~/.config/Stockroom`; delete that folder to remove it too.

### Install on Windows

These steps are for Windows 10 and 11.

1. **Install the tools.** Download and run the **Node.js** installer (LTS, version 22.12 or newer) from [nodejs.org](https://nodejs.org), and the **Git** installer from [git-scm.com/download/win](https://git-scm.com/download/win). The default options are fine for both.

2. **Open Command Prompt.** Press Start, type **cmd** and open **Command Prompt**. Use Command Prompt rather than PowerShell: PowerShell often refuses to run `npm` with "running scripts is disabled on this system".

3. **Get the code and add your Supabase settings.**

   ```bat
   git clone https://github.com/RizStillLearning/inventory-management-application.git
   cd inventory-management-application
   copy .env.example .env
   notepad .env
   ```

   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as described in [Connect the app](#3-connect-the-app), then save and close Notepad.

4. **Build the installer.** The first build downloads Electron and the packaging tools, so it takes a few minutes.

   ```bat
   npm install
   npm run electron:build
   ```

   This creates `release\Stockroom Setup 1.0.0.exe`.

5. **Install it.** Run `explorer release` to open the folder, then double-click **Stockroom Setup 1.0.0.exe**. The installer isn't code-signed, so Windows SmartScreen may show "Windows protected your PC": click **More info**, then **Run anyway**. Stockroom installs for your Windows user (no administrator rights needed), adds Start menu and desktop shortcuts, and opens.

6. **Sign in**, or create an account.

**Update to a newer version:** in the project folder, run `git pull`, `npm install` and `npm run electron:build`, then run the new installer. It replaces the installed version and keeps your sign-in.

**Uninstall:** open **Settings → Apps → Installed apps** (**Apps & features** on Windows 10), find **Stockroom** and choose **Uninstall**. Your sign-in stays in `%APPDATA%\Stockroom`; delete that folder to remove it too.

### Things to know

- **`.env` is built in.** The Supabase URL, key and currency settings are compiled into the app, so rebuild after changing `.env`.
- **Sign-in is remembered** per computer, in the app's data folder: `~/.config/Stockroom` on Linux, `%APPDATA%\Stockroom` on Windows.
- **Title bar.** The window draws its own title bar with minimize, maximize and close buttons, so they appear even on desktops like GNOME that show only a close button by default. On macOS the usual traffic-light buttons stay on the left. The title bar is a separate page from the app, so the buttons keep working while a dialog is open. Press F11 (or **View → Toggle Full Screen**) for full screen.
- **Security.** The built app is served from a private `app://stockroom/` origin with a Content Security Policy. Pages have no Node.js access, and links to other sites or `mailto:` open in the system browser or mail app.

## Development

You need Node.js 22.12 or newer, which Electron and its build tools need. Install the dependencies with `npm install`, and create `.env` as in [Connect the app](#3-connect-the-app).

### Desktop app

```bash
npm run electron:dev
```

This starts the Vite dev server and opens the app in a desktop window. Changes under `src/` hot-reload in the window. Changes to `electron/main.ts` need a restart: close the window and run the command again.

### In a web browser

```bash
npm run dev
```

Open http://localhost:5173, create an account, and sign in. If **Confirm email** is on, set **Site URL** to `http://localhost:5173` under **Authentication → URL Configuration** (and add it to **Redirect URLs**), so the confirmation link brings you back to the app.

### Scripts

| Command | What it does |
|---|---|
| `npm run electron:dev` | Open the desktop app against the dev server, with hot reload |
| `npm run electron:build` | Build the desktop installers into `release/` |
| `npm run dev` | Start the dev server for the browser, with hot reload |
| `npm run build` | Type-check and build static files into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check the app and the Electron main process |

### Deploy the web version

`npm run build` produces a static site in `dist/` that any static host can serve (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3). Set the same `VITE_*` environment variables in the host's build settings, then add the deployed URL to **Authentication → URL Configuration → Redirect URLs** in Supabase.

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
