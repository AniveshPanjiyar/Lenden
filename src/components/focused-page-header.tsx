import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function FocusedPageHeader({
  backHref,
  eyebrow,
  title,
  description,
}: {
  backHref?: string | null;
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="authenticated-focused-header">
      <div className="authenticated-focused-header-inner">
        {backHref ? (
          <Link className="authenticated-back-button" href={backHref} aria-label="Go back">
            <ArrowLeft size={20} />
            <span>Back</span>
          </Link>
        ) : <span className="authenticated-back-spacer" aria-hidden="true" />}
        <div className="authenticated-focused-title">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        <span className="authenticated-back-spacer" aria-hidden="true" />
      </div>
    </header>
  );
}
