import React from "react";
import { Loader2 } from "lucide-react";

interface LoadMoreButtonProps {
  loading: boolean;
  onClick: () => void;
}

export function LoadMoreButton({ loading, onClick }: LoadMoreButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-2 mt-1 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
    >
      {loading && <Loader2 size={12} className="animate-spin" />}
      {loading ? "Loading…" : "Load more"}
    </button>
  );
}
