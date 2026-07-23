export default function BusinessWorkspaceLoading() {
  return (
    <main className="min-h-screen bg-surface px-4 py-8 text-on-surface md:px-8" aria-busy="true">
      <section className="mx-auto grid max-w-4xl gap-6" aria-label="Opening workspace">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-surface-container" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="h-36 animate-pulse rounded-2xl border border-outline-variant/20 bg-surface-container-low" key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
