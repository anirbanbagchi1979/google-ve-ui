"use client";

import React, { useState } from "react";
import { Terminal, ChevronUp, ChevronDown, Trash2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface DebugConsoleProps {
  logs: any[];
  onClear: () => void;
}

const DebugConsole = ({ logs, onClear }: DebugConsoleProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { accessToken, setToken } = useAuth();
  const [manualToken, setManualToken] = useState("");

  const handleSetManualToken = () => {
    if (manualToken.trim()) {
      setToken(manualToken.trim());
      setManualToken("");
      alert("Token updated manually!");
    }
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 transition-all duration-300 z-[100] ${isExpanded ? "h-80" : "h-12"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-slate-900 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-3">
          <Terminal className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase">Debug Console</span>
          {logs.length > 0 && (
            <span className={`text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              logs.some(l => l.type === "ERROR") ? "bg-red-500" : "bg-blue-500"
            }`}>
              {logs.length}
            </span>
          )}
        </div>
        <ChevronUp className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? "" : "rotate-180"}`} />

        {isExpanded && (
          <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
            {/* Manual Token Override */}
            <div className="flex items-center gap-2">
              <input 
                type="password"
                placeholder="Paste GCP Access Token..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] w-48 text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button 
                onClick={handleSetManualToken}
                className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2 py-1 rounded font-bold transition-colors"
              >
                Set Token
              </button>
            </div>

            <button 
              onClick={onClear}
              className="text-slate-500 hover:text-white transition-colors p-1"
              title="Clear Logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="h-68 overflow-y-auto p-4 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 italic">
              Waiting for interactions, flows, or errors...
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log, i) => (
                <div key={i} className={`bg-slate-950 border rounded-lg overflow-hidden ${
                  log.type === "ERROR" ? "border-red-900/50" : 
                  log.type === "RESPONSE" ? "border-green-900/50" : "border-slate-800"
                }`}>
                  <div className={`px-4 py-2 border-b flex justify-between items-center ${
                    log.type === "ERROR" ? "bg-red-950/30 border-red-900/50" : 
                    log.type === "RESPONSE" ? "bg-green-950/30 border-green-900/50" : "bg-slate-900 border-slate-800"
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase ${
                        log.type === "ERROR" ? "text-red-400" : 
                        log.type === "RESPONSE" ? "text-green-400" : "text-blue-400"
                      }`}>
                        {log.type} {log.type === "RESPONSE" ? `[${log.status || 200}]` : ""}
                      </span>
                      {log.operationId && (
                        <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded">
                           <span className="text-[9px] text-blue-300 font-bold">OPERATION:</span>
                           <span className="text-[9px] text-blue-200 truncate max-w-[150px]">{log.operationId}</span>
                           <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(log.operationId);
                            }}
                            className="text-[9px] text-blue-400 hover:text-white underline decoration-dotted"
                           >
                             Copy
                           </button>
                        </div>
                      )}
                      {log.endpoint && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9px] text-slate-400 max-w-[400px] overflow-hidden">
                          <span className="font-bold text-slate-500 uppercase">URL:</span>
                          <span className="truncate">{log.endpoint}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className={`p-4 overflow-x-auto text-[12px] leading-relaxed ${
                    log.type === "ERROR" ? "text-red-300" : 
                    log.type === "RESPONSE" ? "text-green-400" : "text-blue-300"
                  }`}>
                    {JSON.stringify(log.payload || log.data || log, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugConsole;
