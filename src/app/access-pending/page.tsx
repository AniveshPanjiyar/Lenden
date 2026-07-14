import { logoutAction } from "@/app/actions";

export default function AccessPendingPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand-mark" aria-hidden="true">L</div>
        <p className="eyebrow">Lenden access</p>
        <h1>Your account is ready</h1>
        <p>You do not have active business access yet. Ask a business owner or platform administrator to create your membership.</p>
        <form action={logoutAction}>
          <button className="primary-button" type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
