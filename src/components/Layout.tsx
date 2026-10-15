import type { ReactNode } from 'react';
import { stockStatus } from '../lib/format';
import { useInventory } from '../lib/inventory';
import { db } from '../lib/supabase';
import { Icon, type IconName } from './Icon';

const NAV: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/products', label: 'Products', icon: 'box' },
  { path: '/movements', label: 'Stock history', icon: 'history' },
  { path: '/categories', label: 'Categories', icon: 'tag' },
  { path: '/suppliers', label: 'Suppliers', icon: 'truck' },
];

export function Logo() {
  return (
    <svg className="logo" width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M8 12.5 16 8l8 4.5v9L16 26l-8-4.5zM8 12.5 16 17l8-4.5M16 17v9" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function Layout({ path, email, children }: { path: string; email: string; children: ReactNode }) {
  const { products } = useInventory();
  const needsReorder = products.filter((p) => stockStatus(p) !== 'in').length;

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <Logo />
          <span>Stockroom</span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.map((item) => {
            const active = item.path === '/' ? path === '/' : path.startsWith(item.path);
            return (
              <a key={item.path} href={`#${item.path}`} className={`nav__item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.path === '/products' && needsReorder > 0 && (
                  <span className="nav__count" title={`${needsReorder} need reordering`}>
                    {needsReorder}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="sidebar__user">
          <span className="sidebar__email" title={email}>
            {email}
          </span>
          <button className="icon-btn" onClick={() => void db().auth.signOut()} aria-label="Sign out" title="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
