"use client";

import Image from "next/image";
import { Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { changeOwnPasswordAction } from "@/app/actions";

import styles from "./change-password.module.css";

type PasswordSetupFormProps = {
  error: string | null;
  fullName: string;
};

function SavePasswordButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.submitButton} disabled={pending || !canSubmit} type="submit">
      {pending ? <span className={styles.spinner} aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
      {pending ? "Saving password…" : "Save password & continue"}
    </button>
  );
}

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={met ? styles.requirementMet : undefined}>
      <span className={styles.requirementIcon} aria-hidden="true">
        <Check />
      </span>
      {children}
    </li>
  );
}

export function PasswordSetupForm({ error, fullName }: PasswordSetupFormProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const hasMinimumLength = password.length >= 8;
  const passwordsMatch = confirmation.length > 0 && password === confirmation;
  const canSubmit = hasMinimumLength && passwordsMatch;

  return (
    <main className={styles.page}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <section className={styles.shell} aria-labelledby="password-heading">
        <aside className={styles.securityPanel}>
          <div className={styles.securityPattern} aria-hidden="true" />

          <div className={styles.brand}>
            <Image className={styles.logo} src="/icon-192.png" alt="Lenden" width={48} height={48} priority />
            <span>Lenden</span>
          </div>

          <div className={styles.securityCopy}>
            <span className={styles.panelEyebrow}>
              <ShieldCheck aria-hidden="true" />
              Secure account setup
            </span>
            <h1>Your business deserves a strong first line of defence.</h1>
            <p>Set a private password to protect your workspace, team and business activity.</p>
          </div>

          <ul className={styles.benefitList}>
            <li><Check aria-hidden="true" />Private to your account</li>
            <li><Check aria-hidden="true" />Protects your business access</li>
            <li><Check aria-hidden="true" />A quick, one-time setup</li>
          </ul>
        </aside>

        <div className={styles.formPanel}>
          <div className={styles.mobileBrand}>
            <Image src="/icon-192.png" alt="" width={38} height={38} />
            <span>Lenden</span>
          </div>

          <header className={styles.formHeader}>
            <p className={styles.eyebrow}>Almost there</p>
            <h2 id="password-heading">Choose your password</h2>
            <p>Hi {fullName}, replace your temporary password before continuing.</p>
          </header>

          {error ? (
            <div className={styles.errorAlert} role="alert">
              <span aria-hidden="true">!</span>
              <p>{error}</p>
            </div>
          ) : null}

          <form action={changeOwnPasswordAction} className={styles.form}>
            <label className={styles.field}>
              <span>New password</span>
              <span className={styles.inputWrap}>
                <LockKeyhole className={styles.leadingIcon} aria-hidden="true" />
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  aria-describedby="password-requirements"
                  placeholder="Enter at least 8 characters"
                  required
                />
                <button
                  className={styles.revealButton}
                  type="button"
                  aria-label={showPassword ? "Hide new password" : "Show new password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
            </label>

            <label className={styles.field}>
              <span>Confirm password</span>
              <span className={styles.inputWrap}>
                <LockKeyhole className={styles.leadingIcon} aria-hidden="true" />
                <input
                  name="password_confirmation"
                  type={showConfirmation ? "text" : "password"}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Enter your password again"
                  required
                />
                <button
                  className={styles.revealButton}
                  type="button"
                  aria-label={showConfirmation ? "Hide confirmed password" : "Show confirmed password"}
                  aria-pressed={showConfirmation}
                  onClick={() => setShowConfirmation((current) => !current)}
                >
                  {showConfirmation ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
            </label>

            <ul className={styles.requirements} id="password-requirements" aria-label="Password requirements">
              <Requirement met={hasMinimumLength}>At least 8 characters</Requirement>
              <Requirement met={passwordsMatch}>Both passwords match</Requirement>
            </ul>

            <SavePasswordButton canSubmit={canSubmit} />
          </form>

          <p className={styles.footerNote}>
            <ShieldCheck aria-hidden="true" />
            You’ll continue to your workspace after saving.
          </p>
        </div>
      </section>
    </main>
  );
}
