"use client";

import { ReturnAwareLink } from "@/components/return-aware-link";
import { useMemo, useState } from "react";
import { businessLabels } from "@/lib/constants";
import type { AdminBusinessSummary } from "./admin-data";
import BusinessStatusAction from "./business-status-action";

type Filter = "all" | "active" | "suspended";

export default function BusinessDirectoryClient({ businesses }: { businesses: AdminBusinessSummary[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBusinesses = useMemo(() => businesses.filter((business) => {
    const matchesFilter = filter === "all" || business.status === filter;
    const matchesQuery = !normalizedQuery || [
      business.name,
      business.slug,
      business.owner?.fullName ?? "",
      business.owner?.email ?? "",
    ].some((field) => field.toLowerCase().includes(normalizedQuery));
    return matchesFilter && matchesQuery;
  }), [businesses, filter, normalizedQuery]);

  const activeCount = businesses.filter((business) => business.status === "active").length;
  const suspendedCount = businesses.length - activeCount;
  const ownerlessCount = businesses.filter((business) => !business.owner).length;

  return (
    <>
      <section className="admin-metric-grid" aria-label="Business summary">
        <article><span>Total businesses</span><strong>{businesses.length}</strong></article>
        <article><span>Active</span><strong>{activeCount}</strong></article>
        <article><span>Suspended</span><strong>{suspendedCount}</strong></article>
        <article className={ownerlessCount ? "attention" : ""}><span>Need an Owner</span><strong>{ownerlessCount}</strong></article>
      </section>

      <section className="admin-directory-panel">
        <div className="admin-directory-toolbar">
          <label className="admin-search-field">
            <span>Search businesses</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, slug, Owner, or email"
            />
          </label>
          <div className="admin-filter-tabs" aria-label="Filter businesses">
            {(["all", "active", "suspended"] as Filter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
              >
                {item === "all" ? "All" : item === "active" ? "Active" : "Suspended"}
              </button>
            ))}
          </div>
        </div>

        <p className="admin-results-count" role="status">
          Showing {visibleBusinesses.length} of {businesses.length} businesses
        </p>

        {visibleBusinesses.length > 0 ? (
          <div className="admin-business-table-wrap">
            <table className="admin-business-table">
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Active users</th>
                  <th scope="col">Modules</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleBusinesses.map((business) => (
                  <tr key={business.id}>
                    <td data-label="Business">
                      <strong>{business.name}</strong>
                      <span>/{business.slug}</span>
                    </td>
                    <td data-label="Owner">
                      {business.owner ? <><strong>{business.owner.fullName}</strong><span>{business.owner.email}</span></> : <span className="admin-warning-text">Owner not assigned</span>}
                    </td>
                    <td data-label="Active users">{business.activeUserCount}</td>
                    <td data-label="Modules">
                      <div className="admin-chip-list">
                        {business.enabledModules.map((module) => <span key={module}>{businessLabels[module]}</span>)}
                      </div>
                    </td>
                    <td data-label="Status"><span className={`status-pill ${business.status}`}>{business.status}</span></td>
                    <td className="admin-table-actions">
                      <ReturnAwareLink className="secondary-button" href={`/admin/businesses/${business.id}`}>Open</ReturnAwareLink>
                      <BusinessStatusAction
                        businessId={business.id}
                        businessName={business.name}
                        status={business.status}
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <h2>No businesses found</h2>
            <p>Try another search or status filter.</p>
          </div>
        )}
      </section>
    </>
  );
}
