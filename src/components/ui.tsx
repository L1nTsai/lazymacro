import Link from "next/link";
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

export const Chevron = ({ direction }: { direction: "left" | "right" }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={direction === "left" ? "m12.500 4-6 6 6 6" : "m7.500 4 6 6-6 6"} />
  </svg>
);

export function NavRow({ href, label, detail }: { href: string; label: string; detail?: string }) {
  return (
    <Link href={href} transitionTypes={["nav-forward"]} className="flex min-h-14 items-center justify-between gap-4 px-4">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
        {detail ? <span className="truncate">{detail}</span> : null}
        <Chevron direction="right" />
      </span>
    </Link>
  );
}

export function NavList({ children }: { children: ReactNode }) {
  return <nav className="divide-y divide-border rounded-md border border-border">{children}</nav>;
}

/** A pushed page: a back arrow, a title, and content that fills what's left. */
export function SubPage({ title, back, children, wide = false }: { title: string; back: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex h-full w-full ${wide ? "lg:max-w-5xl" : "lg:max-w-xl"} flex-col bg-background px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-[max(env(safe-area-inset-bottom),1rem)] lg:py-6`}>
      <Link
        href={back}
        transitionTypes={["nav-back"]}
        aria-label="Back"
        className="-ml-3 flex size-11 shrink-0 items-center justify-center"
      >
        <Chevron direction="left" />
      </Link>
      <div className="mt-1 mb-4 shrink-0">
        <PageTitle>{title}</PageTitle>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

const SEGMENT = "min-h-11 flex-1 text-sm font-medium";

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-px overflow-hidden rounded-md border border-border bg-border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`${SEGMENT} ${value === option.value ? "bg-foreground text-background" : "bg-background text-muted"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
