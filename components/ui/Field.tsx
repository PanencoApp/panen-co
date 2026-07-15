import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  points: string;
  children: ReactNode;
};

export function Field({ label, points, children }: FieldProps) {
  return (
    <label className="grid gap-2 text-sm font-black text-[#4e596b]">
      <span className="flex items-center justify-between gap-3">
        <span dangerouslySetInnerHTML={{ __html: label }} />
        <small className="shrink-0 rounded-full bg-[#00baff] px-2.5 py-1 text-xs font-black text-black shadow-[0_0_16px_rgba(0,186,255,.22)]">
          {points}
        </small>
      </span>
      {children}
    </label>
  );
}
