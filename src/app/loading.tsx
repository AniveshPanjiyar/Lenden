export default function Loading() {
  return (
    <main className="app-splash" aria-label="Loading Lenden">
      <section className="app-splash-card" role="status" aria-live="polite">
        <div className="app-splash-logo-wrap" aria-hidden="true">
          <span className="app-splash-logo" />
        </div>
        <div className="app-splash-copy">
          <p className="eyebrow">Lenden</p>
          <h1>Collections made clear</h1>
          <p>Opening Lenden…</p>
        </div>
        <div className="app-splash-progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}
