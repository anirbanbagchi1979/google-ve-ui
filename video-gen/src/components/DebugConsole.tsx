"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChevronUp, Trash2, Circle } from "lucide-react";

interface DebugConsoleProps {
  logs: any[];
  onClear: () => void;
}

const TYPE_STYLES: Record<string, { label: string; text: string; bg: string; border: string }> = {
  ERROR:    { label: "text-red-500",   text: "text-red-600",   bg: "bg-red-50",   border: "border-red-100" },
  RESPONSE: { label: "text-green-600", text: "text-green-700", bg: "bg-green-50", border: "border-green-100" },
  REQUEST:  { label: "text-blue-500",  text: "text-blue-700",  bg: "bg-blue-50",  border: "border-blue-100" },
};
const defaultStyle = { label: "text-slate-500", text: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" };

const DebugConsole = ({ logs, onClear }: DebugConsoleProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, isExpanded]);

  const hasError = logs.some(l => l.type === "ERROR");

  return (
    <div className={`shrink-0 border-t border-slate-200 bg-white transition-all duration-300 ${isExpanded ? "h-72" : "h-9"}`}>
      {/* Header bar */}
      <div
        className="h-9 flex items-center justify-between px-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
        onClick={() => setIsExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Circle
            size={7}
            className={`shrink-0 ${hasError ? "fill-red-400 text-red-400" : logs.length > 0 ? "fill-green-400 text-green-400" : "fill-slate-300 text-slate-300"}`}
          />
          <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Logs</span>
          {logs.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              hasError ? "bg-red-50 text-red-500 border border-red-100" : "bg-slate-100 text-slate-500"
            }`}>
              {logs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded && logs.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onClear(); }}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors rounded"
              title="Clear"
            >
              <Trash2 size={12} />
            </button>
          )}
          <ChevronUp size={13} className={`text-slate-400 transition-transform ${isExpanded ? "" : "rotate-180"}`} />
        </div>
      </div>

      {/* Log entries */}
      {isExpanded && (
        <div className="h-[calc(100%-2.25rem)] overflow-y-auto px-3 py-2 space-y-2 bg-slate-50/60">
          {logs.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center pt-6 italic">No activity yet</p>
          ) : (
            logs.map((log, i) => {
              const s = TYPE_STYLES[log.type] ?? defaultStyle;
              return (
                <div key={i} className={`rounded-lg border ${s.border} ${s.bg} overflow-hidden`}>
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-inherit">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${s.label}`}>
                        {log.type}{log.type === "RESPONSE" && log.status ? ` ${log.status}` : ""}
                      </span>
                      {log.operationId && (
                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                          {log.operationId}
                        </span>
                      )}
                      {log.endpoint && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[260px] hidden sm:block">
                          {log.endpoint}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className={`px-3 py-2 text-[11px] leading-relaxed overflow-x-auto font-mono ${s.text}`}>
                    {JSON.stringify(log.payload || log.data || log, null, 2)}
                  </pre>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
};

export default DebugConsole;
