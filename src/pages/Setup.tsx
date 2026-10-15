import { Logo } from '../components/Layout';

/** Shown when .env is missing, or when the database tables have not been created yet. */
export function SetupScreen({ reason }: { reason: 'env' | 'schema' }) {
  return (
    <div className="auth">
      <div className="auth__card auth__card--wide card">
        <div className="auth__brand">
          <Logo />
          <span>Stockroom</span>
        </div>
        {reason === 'env' ? (
          <>
            <h1>Connect to Supabase</h1>
            <p className="muted">The app needs your Supabase project URL and public key.</p>
            <ol className="steps">
              <li>
                In the Supabase dashboard, open your project and click <strong>Connect</strong> (or go to <strong>Project Settings → API Keys</strong>).
              </li>
              <li>
                Copy <code>.env.example</code> to <code>.env</code> in the project folder and fill in <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> (the publishable or anon key, never the secret/service_role key).
              </li>
              <li>
                Restart <code>npm run dev</code> so Vite picks up the new values.
              </li>
            </ol>
          </>
        ) : (
          <>
            <h1>Create the database tables</h1>
            <p className="muted">You are connected, but the inventory tables do not exist yet.</p>
            <ol className="steps">
              <li>
                In the Supabase dashboard, open <strong>SQL Editor → New query</strong>.
              </li>
              <li>
                Paste the contents of <code>supabase/schema.sql</code> and click <strong>Run</strong>.
              </li>
              <li>
                Optional: run <code>supabase/seed.sql</code> the same way to load sample products.
              </li>
              <li>Reload this page.</li>
            </ol>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </>
        )}
      </div>
    </div>
  );
}
