"use client";

import { usePathname } from "next/navigation";
import { ReturnAwareLink } from "@/components/return-aware-link";

const items = [
  { segment: "", label: "Overview" },
  { segment: "users", label: "Users" },
  { segment: "ownership", label: "Ownership" },
  { segment: "support", label: "Support" },
  { segment: "activity", label: "Activity" },
];

export default function BusinessDetailNav({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const base = `/admin/businesses/${businessId}`;

  return (
    <nav className="admin-detail-nav" aria-label="Business administration">
      {items.map((item) => {
        const href = item.segment ? `${base}/${item.segment}` : base;
        const active = item.segment ? pathname.startsWith(href) : pathname === href;
        return <ReturnAwareLink key={item.label} href={href} aria-current={active ? "page" : undefined}>{item.label}</ReturnAwareLink>;
      })}
    </nav>
  );
}
