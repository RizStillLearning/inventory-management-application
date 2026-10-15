import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { FeedbackProvider } from './components/Feedback';
import { Icon } from './components/Icon';
import { Layout } from './components/Layout';
import { ProductActionsProvider } from './components/ProductActions';
import { friendlyError, isSchemaMissing } from './lib/api';
import { InventoryProvider, useInventory } from './lib/inventory';
import { useRoute, type Route } from './lib/router';
import { db, isConfigured } from './lib/supabase';
import { AuthScreen } from './pages/Auth';
import { Categories } from './pages/Categories';
import { Dashboard } from './pages/Dashboard';
import { Movements } from './pages/Movements';
import { Products } from './pages/Products';
import { SetupScreen } from './pages/Setup';
import { Suppliers } from './pages/Suppliers';

export function App() {
  if (!isConfigured) return <SetupScreen reason="env" />;
  return <AuthGate />;
}

function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void db()
      .auth.getSession()
      .then(({ data }) => setSession(data.session));
    const { data } = db().auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <FullPageSpinner />;
  if (!session) return <AuthScreen />;

  return (
    <FeedbackProvider>
      {/* Keyed by user so signing in as someone else starts from a clean slate. */}
      <InventoryProvider key={session.user.id}>
        <ProductActionsProvider>
          <Shell email={session.user.email ?? ''} />
        </ProductActionsProvider>
      </InventoryProvider>
    </FeedbackProvider>
  );
}

function Shell({ email }: { email: string }) {
  const route = useRoute();
  const { loading, error, products, refresh } = useInventory();

  if (error && isSchemaMissing(error)) return <SetupScreen reason="schema" />;

  return (
    <Layout path={route.path} email={email}>
      {error !== null && (
        <div className="banner banner--error banner--action">
          <span>
            <Icon name="alert" size={16} /> {friendlyError(error)}
          </span>
          <button className="btn btn--small" onClick={() => void refresh()}>
            <Icon name="refresh" size={14} /> Retry
          </button>
        </div>
      )}
      {loading && products.length === 0 ? <PageSpinner /> : <Page route={route} />}
    </Layout>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.path) {
    case '/products':
      return <Products route={route} />;
    case '/movements':
      return <Movements route={route} />;
    case '/categories':
      return <Categories />;
    case '/suppliers':
      return <Suppliers />;
    default:
      return <Dashboard />;
  }
}

function FullPageSpinner() {
  return (
    <div className="auth">
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

function PageSpinner() {
  return (
    <div className="page page--center">
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}
