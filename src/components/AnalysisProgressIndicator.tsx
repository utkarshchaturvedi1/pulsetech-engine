"use client";

type AnalysisProgressIndicatorProps = {
  progress: number;
  label: string;
  title?: string;
};

export default function AnalysisProgressIndicator({
  progress,
  label,
  title = "Building your AI Sales Employee",
}: AnalysisProgressIndicatorProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-500">
        {title}
      </p>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium leading-5 text-slate-700">
          {label}
        </p>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-blue-600">
          {clamped}%
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
