const formatNumber = (n: number) => Math.round(n).toLocaleString("en-US");

export function CaloriesRing({ eaten, target }: { eaten: number; target: number }) {
  const remaining = target - eaten;
  const over = remaining < 0;
  const size = 240;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(eaten / target, 1) * circumference;

  return (
    <div className="relative mx-auto aspect-square h-full max-h-60 max-w-full">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={over ? "var(--data-over)" : "var(--data-calories)"}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-semibold tracking-tighter tabular-nums [font-size:min(3.75rem,8.5dvh)] leading-none">{formatNumber(Math.abs(remaining))}</span>
        <span className="mt-1 text-sm text-muted">{over ? "kcal over target" : "kcal left"}</span>
      </div>
    </div>
  );
}

export function MacroBar({
  label,
  eaten,
  target,
  color,
}: {
  label: string;
  eaten: number;
  target: number;
  color: string;
}) {
  const share = target > 0 ? Math.min(eaten / target, 1) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted tabular-nums">
          {formatNumber(eaten)} of {formatNumber(target)} g
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-valuenow={Math.round(Math.min(eaten, target))}
        className="h-2 overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${share * 100}%`, background: eaten > target ? "var(--data-over)" : color }}
        />
      </div>
    </div>
  );
}
