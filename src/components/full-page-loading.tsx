export function FullPageLoading({ label = "Loading Lenden" }: { label?: string }) {
  return (
    <main className="page-loading" aria-busy="true">
      <div className="loading-dots" role="status" aria-label={label} aria-live="polite">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
    </main>
  );
}
