export default function BusinessWorkspaceLoading() {
  return (
    <main className="page-loading" aria-busy="true">
      <div className="loading-dots" role="status" aria-label="Opening workspace" aria-live="polite">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
    </main>
  );
}
