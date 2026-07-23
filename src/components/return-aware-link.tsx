"use client";

import Link, { type LinkProps } from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { safeReturnPath, withReturnTo } from "@/lib/navigation";

export function ReturnAwareLink({
  href,
  children,
  ...props
}: LinkProps & { href: string; children: ReactNode; className?: string }) {
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"), "");
  return (
    <Link href={withReturnTo(href, returnTo)} {...props}>
      {children}
    </Link>
  );
}
