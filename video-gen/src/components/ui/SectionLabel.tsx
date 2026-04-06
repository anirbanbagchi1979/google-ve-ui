import React from "react";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{children}</p>
  );
}
