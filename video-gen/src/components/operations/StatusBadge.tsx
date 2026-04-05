// src/components/operations/StatusBadge.tsx
"use client";

import React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface StatusBadgeProps {
  status: "RUNNING" | "DONE" | "ERROR";
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
  if (status === "DONE") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
        <CheckCircle2 size={12} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Completed</span>
      </div>
    );
  }
  if (status === "ERROR") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-600 rounded-lg border border-red-100">
        <XCircle size={12} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Failed</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
      <Loader2 size={12} className="animate-spin" />
      <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Running</span>
    </div>
  );
};

export default StatusBadge;
