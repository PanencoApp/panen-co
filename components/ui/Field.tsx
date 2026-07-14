import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  points: string;
  children: ReactNode;
};

export function Field({ label, points, children }: FieldProps) {
  return (
    <label className="grid gap-2 text-sm font-black text-[#4e596b]">
      <span dangerouslySetInnerHTML={{ __html: label }} />
      <small className="text-[#00baff]">{points}</small>
      {children}
    </label>
  );
}
