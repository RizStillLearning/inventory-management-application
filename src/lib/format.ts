import type { Product, StockStatus } from './types';

/** Returns `value` if Intl accepts it, otherwise warns and falls back, so a typo in .env can't blank the app. */
function validated<T>(name: string, value: T, fallback: T, test: (v: T) => void): T {
  try {
    test(value);
    return value;
  } catch {
    console.warn(`Ignoring invalid ${name}=${String(value)}; using ${fallback === undefined ? 'the default' : String(fallback)}.`);
    return fallback;
  }
}

const env = import.meta.env;
// Locale for numbers and money, e.g. "id-ID". Defaults to the viewer's browser language.
const locale = validated<string | undefined>('VITE_LOCALE', env.VITE_LOCALE || undefined, undefined, (v) => new Intl.NumberFormat(v));
const currencyCode = validated('VITE_CURRENCY', (env.VITE_CURRENCY as string | undefined) || 'USD', 'USD', (v) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: v }),
);
// Digits after the decimal point, e.g. 0 for Rupiah. Defaults to the currency's standard.
const decimals = validated<string | undefined>('VITE_CURRENCY_DECIMALS', env.VITE_CURRENCY_DECIMALS || undefined, undefined, (v) => {
  if (v !== undefined && !/^\s*[0-4]\s*$/.test(v)) throw new RangeError();
});
const fraction = decimals === undefined ? {} : { minimumFractionDigits: Number(decimals), maximumFractionDigits: Number(decimals) };

const currency = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, ...fraction });
const currencyCompact = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: currencyCode,
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatMoney = (n: number) => currency.format(n);
export const formatMoneyCompact = (n: number) => (Math.abs(n) < 10_000 ? currency.format(n) : currencyCompact.format(n));
export const formatInt = (n: number) => integer.format(n);
export const formatCompact = (n: number) => (Math.abs(n) < 10_000 ? integer.format(n) : compact.format(n));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatSigned = (n: number) => (n > 0 ? `+${integer.format(n)}` : `−${integer.format(Math.abs(n))}`);

export function formatRelative(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
    ['year', Infinity],
  ];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return unit === 'second' ? 'just now' : relative.format(Math.round(value), unit);
    value /= size;
  }
  return dateTime.format(new Date(iso));
}

export function stockStatus(p: Pick<Product, 'quantity' | 'reorder_level'>): StockStatus {
  if (p.quantity <= 0) return 'out';
  if (p.quantity <= p.reorder_level) return 'low';
  return 'in';
}

export const statusLabel: Record<StockStatus, string> = {
  in: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
