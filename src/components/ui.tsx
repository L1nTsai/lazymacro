import type { ComponentProps, ReactNode } from "react";

const BASE_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-50";

export const BUTTON_STYLES = {
  primary: `${BASE_BUTTON} bg-foreground text-background`,
  secondary: `${BASE_BUTTON} border border-border bg-background text-foreground`,
  danger: `${BASE_BUTTON} border border-error text-error`,
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_STYLES }) {
  return <button className={`${BUTTON_STYLES[variant]} ${className}`} {...props} />;
}

const FIELD = "min-h-11 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${FIELD} ${className}`} {...props} />;
}

// iOS ignores min-height on native selects, so the native look is replaced.
export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select className={`${FIELD} h-11 appearance-none pr-9 ${className}`} {...props} />
      <svg
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-error">
      {message}
    </p>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>;
}

const TRUST_STYLE = {
  verified: { label: "Verified", background: "var(--status-verified)", color: "var(--on-status)" },
  estimated: { label: "Estimated", background: "var(--status-estimated)", color: "var(--on-status-amber)" },
  rough: { label: "Rough", background: "var(--status-rough)", color: "var(--on-status)" },
};

export function TrustBadge({ confidence }: { confidence: keyof typeof TRUST_STYLE }) {
  const { label, background, color } = TRUST_STYLE[confidence];
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium" style={{ background, color }}>
      {label}
    </span>
  );
}
