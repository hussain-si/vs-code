/** Shown when the Supabase environment variables are missing. */
export default function SetupScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card wide">
        <img src="/favicon.svg" className="auth-logo" alt="" />
        <h1>Connect Supabase</h1>
        <p className="auth-sub">CodeVault needs two environment variables before it can store files.</p>
        <pre className="setup-code">
          {'VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key'}
        </pre>
        <ol className="setup-steps">
          <li>Create a project at supabase.com.</li>
          <li>
            Open <b>SQL Editor</b> and run <code>supabase/schema.sql</code> from this repository.
          </li>
          <li>
            Copy the <b>Project URL</b> and the <b>anon / publishable key</b> from Project Settings → API.
          </li>
          <li>
            Locally: put them in <code>.env.local</code> and restart <code>npm run dev</code>.
            <br />
            On Vercel: add them under Settings → Environment Variables, then redeploy.
          </li>
        </ol>
      </div>
    </div>
  )
}
