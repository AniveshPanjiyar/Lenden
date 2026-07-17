"use client";

import { useState } from "react";

export default function OneTimeSecret({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="admin-one-time-secret" role="status">
      <div>
        <strong>Copy this one-time password now</strong>
        <p>It will not be shown again. It is not stored in the URL or browser storage.</p>
      </div>
      <div className="admin-secret-row">
        <code>{password}</code>
        <button
          className="secondary-button"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
