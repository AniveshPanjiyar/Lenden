"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { safeReturnPath } from "@/lib/navigation";

export default function AdminBackLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fallback = pathname === "/admin/businesses"
    ? "/settings?section=businesses"
    : "/admin/businesses";
  const href = safeReturnPath(searchParams.get("returnTo"), fallback);
  return (
    <Link className="platform-admin-back" href={href} aria-label="Go back">
      <ArrowLeft size={19} />
      <span>Back</span>
    </Link>
  );
}
