import { loadPendingBusinessRequests } from "../admin-data";
import BusinessRequestReview from "./business-request-review";

export default async function BusinessRequestsPage() {
  const requests = await loadPendingBusinessRequests();
  return <main className="platform-admin-main"><header className="platform-admin-page-header"><div><p className="eyebrow">Platform workspace</p><h1>Business requests</h1><p>Review user-submitted requests, finalize operating settings, and assign the requester as Owner.</p></div><span className="status-pill pending">{requests.length} pending</span></header><BusinessRequestReview requests={requests} /></main>;
}

