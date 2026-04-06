"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Video,
  Search,
  AlertCircle,
  Filter,
  X
} from "lucide-react";

import { useConfig } from "@/context/ConfigContext";
import { formatBytes } from "@/utils/time";

interface Operation {
  id: string;
  name: string;
  status: "RUNNING" | "DONE" | "ERROR";
  type: string;
  userEmail?: string;
  createdAt: any;
  updatedAt?: any;
  completedAt?: any;
  result?: any;
  payload?: any;
  originalGcsUri?: string;
  maskVideoGcsUri?: string;
  error?: {
    code: number;
    message: string;
  };
}

interface OperationsPanelProps {
  operations: Operation[];
  addLog: (log: any) => void;
  onVideoSelect?: (url: string, originalUrl?: string, leftLabel?: string, rightLabel?: string) => void;
  onStatusUpdate?: (id: string, status: "DONE" | "ERROR", result?: any, error?: any) => Promise<void>;
}

const DATE_OPTIONS = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

const OperationsPanel = ({ operations, addLog, onVideoSelect, onStatusUpdate }: OperationsPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [checkResults, setCheckResults] = useState<Record<string, any>>({});
  const { config } = useConfig();

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");

  // Force re-render every second to update "RUNNING" operation elapsed times
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getDurationString = (op: Operation) => {
    if (!op.createdAt) return null;
    const start = op.createdAt.seconds ? op.createdAt.seconds * 1000 : new Date(op.createdAt).getTime();
    let end;
    
    if (op.completedAt) {
      end = op.completedAt.seconds ? op.completedAt.seconds * 1000 : new Date(op.completedAt).getTime();
    } else if (op.status === "DONE" || op.status === "ERROR") {
      end = op.updatedAt?.seconds ? op.updatedAt.seconds * 1000 : new Date(op.updatedAt || now).getTime();
    } else {
      end = now;
    }

    const diffSeconds = Math.max(0, Math.floor((end - start) / 1000));
    if (diffSeconds < 60) return `${diffSeconds}s`;
    const m = Math.floor(diffSeconds / 60);
    const s = diffSeconds % 60;
    return `${m}m ${s}s`;
  };

  // Extract the actual output GCS URI from result (Veo returns videos array)
  const getOutputGcsUri = (op: Operation): string | null => {
    return op.result?.videos?.[0]?.gcsUri || op.result?.video?.gcsUri || null;
  };

  // Convert gs://bucket/path to Firebase Storage download URL
  const gcsToFirebaseUrl = (gcsUri: string): string => {
    // gs://bucket-name/path/to/file.mp4
    const withoutScheme = gcsUri.replace("gs://", "");
    const slashIdx = withoutScheme.indexOf("/");
    const bucket = withoutScheme.substring(0, slashIdx);
    const path = withoutScheme.substring(slashIdx + 1);
    const encodedPath = path.split("/").map(encodeURIComponent).join("%2F");
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
  };

  const handleStatusCheck = async (op: Operation) => {
    setCheckingIds(prev => new Set(prev).add(op.id));
    
    // Vertex AI Endpoint for deep status check
    const modelName = (op as any).modelUsed || (op.type === 'upscale' ? config.upscaleModel : config.videoGenModel);
    const endpoint = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${modelName}:fetchPredictOperation`;
    
    const payload = {
      operationName: op.name
    };

    addLog({
      type: "REQUEST",
      message: `Deep Status Check for ${op.id}`,
      endpoint: endpoint,
      payload: payload
    });

    try {
      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, payload })
      });

      const data = await response.json();

      addLog({
        type: "RESPONSE",
        status: response.status,
        message: `Status check result for ${op.id.slice(-6)}`,
        endpoint: endpoint,
        data: data
      });

      setCheckResults(prev => ({ ...prev, [op.id]: data }));

      if (data.done) {
        if (data.error) {
          await onStatusUpdate?.(op.id, "ERROR", undefined, data.error);
        } else {
          await onStatusUpdate?.(op.id, "DONE", data.response, undefined);
        }
      }

    } catch (error: any) {
      addLog({
        type: "ERROR",
        message: `Status check failed for ${op.id}`,
        details: error.message
      });
    } finally {
      setCheckingIds(prev => {
        const next = new Set(prev);
        next.delete(op.id);
        return next;
      });
    }
  };

  // Derived: unique types and users from operations
  const uniqueTypes = Array.from(new Set(operations.map(op => op.type))).filter(Boolean);
  const uniqueUsers = Array.from(new Set(operations.map(op => op.userEmail).filter(Boolean))) as string[];

  // Apply filters
  const filteredOps = operations.filter(op => {
    if (filterType !== "all" && op.type !== filterType) return false;
    if (filterStatus !== "all" && op.status !== filterStatus) return false;
    if (filterUser !== "all" && op.userEmail !== filterUser) return false;
    if (filterDate !== "all" && op.createdAt) {
      const ts = op.createdAt.seconds ? op.createdAt.seconds * 1000 : new Date(op.createdAt).getTime();
      const diffMs = now - ts;
      if (filterDate === "today" && diffMs > 86_400_000) return false;
      if (filterDate === "7d" && diffMs > 7 * 86_400_000) return false;
      if (filterDate === "30d" && diffMs > 30 * 86_400_000) return false;
    }
    return true;
  });

  const activeFilterCount = [filterType !== "all", filterStatus !== "all", filterDate !== "all", filterUser !== "all"].filter(Boolean).length;

  return (
    <div className="w-full bg-slate-50 flex flex-col h-full overflow-hidden transition-all duration-300">
      {/* Header */}
      <div 
        className="px-6 py-4 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-200/50 transition-colors shrink-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <History size={18} className="text-blue-500" />
          <span className="text-[12px] font-bold uppercase tracking-wider text-slate-600">Task Monitor</span>
          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 text-[10px] rounded-full font-bold">
            {operations.filter(op => op.status === "RUNNING").length} Active
          </span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </div>

      {/* Filter Bar */}
      {isExpanded && (
        <div className="px-4 py-3 bg-white border-b border-slate-200 shrink-0 space-y-2.5">
          {/* Row 1: Type pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0 flex items-center gap-1"><Filter size={9} /> Type</span>
            {["all", ...uniqueTypes].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                  filterType === t
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Row 2: Status pills */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0">Status</span>
            {([["all", "All"], ["RUNNING", "Running"], ["DONE", "Done"], ["ERROR", "Error"]] as [string, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                  filterStatus === val
                    ? val === "RUNNING" ? "bg-blue-500 text-white border-blue-500"
                      : val === "DONE" ? "bg-emerald-500 text-white border-emerald-500"
                      : val === "ERROR" ? "bg-red-500 text-white border-red-500"
                      : "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Row 3: Date + User */}
          <div className="flex items-center gap-2">
            {/* Date filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
              {DATE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilterDate(opt.value)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                    filterDate === opt.value
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* User filter */}
            {uniqueUsers.length > 0 && (
              <select
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                className="flex-1 min-w-0 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 truncate"
              >
                <option value="all">All users</option>
                {uniqueUsers.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilterType("all"); setFilterDate("all"); setFilterUser("all"); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-red-400 hover:text-red-600 border border-red-100 bg-red-50 rounded-lg transition-colors shrink-0"
              >
                <X size={10} /> Clear {activeFilterCount}
              </button>
            )}
          </div>

          {/* Results count */}
          <p className="text-[9px] text-slate-400 font-semibold">
            {filteredOps.length} of {operations.length} tasks
          </p>
        </div>
      )}

      {/* List */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
          {filteredOps.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-40">
              <Loader2 size={32} className="mb-4 text-slate-300" />
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                {operations.length === 0 ? "Waiting for generations..." : "No tasks match filters"}
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {filteredOps.map((op) => (
              <div 
                key={op.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group"
              >
                {/* Status Bar */}
                <div className={`h-1.5 w-full ${
                  op.status === "RUNNING" ? "bg-blue-400 animate-pulse" : 
                  op.status === "DONE" ? "bg-emerald-400" : "bg-red-400"
                }`} />

                <div className="p-4 space-y-3">
                  {/* Metadata Row */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 pr-4 min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase rounded border border-slate-200">
                          {op.type}
                        </span>
                        {op.userEmail && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[150px] italic">
                            via {op.userEmail}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-bold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          {op.status === "RUNNING" ? "⏳" : "⏱️"} {getDurationString(op)}
                        </span>
                      </div>
                      <h4 className="text-[13px] font-bold text-slate-800 truncate">
                        {op.type === "upscale" ? "4K Video Upscale" : op.type === "transform" ? "Video Transform" : "Vertex AI Generation"}
                      </h4>
                      {op.type === "upscale" && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(op as any).resolution && (
                            <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 text-[9px] font-bold rounded uppercase">
                              {(op as any).resolution}
                            </span>
                          )}
                          {(op as any).compressionQuality && (
                            <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 text-[9px] font-bold rounded">
                              {(op as any).compressionQuality.replace(/_/g, " ")}
                            </span>
                          )}
                          {(op as any).inputFileSize != null && (
                            <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-500 text-[9px] font-bold rounded">
                              Input: {formatBytes((op as any).inputFileSize)}
                            </span>
                          )}
                        </div>
                      )}
                      {op.type === "transform" && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(op as any).compressionQuality && (
                            <span className="px-1.5 py-0.5 bg-violet-50 border border-violet-100 text-violet-600 text-[9px] font-bold rounded">
                              {(op as any).compressionQuality.replace(/_/g, " ")}
                            </span>
                          )}
                          {(op as any).videoTransformStrength != null && (
                            <span className="px-1.5 py-0.5 bg-violet-50 border border-violet-100 text-violet-600 text-[9px] font-bold rounded">
                              Strength {Number((op as any).videoTransformStrength).toFixed(2)}
                            </span>
                          )}
                          {(op as any).numDiffusionSteps != null && (
                            <span className="px-1.5 py-0.5 bg-violet-50 border border-violet-100 text-violet-600 text-[9px] font-bold rounded">
                              {(op as any).numDiffusionSteps} Steps
                            </span>
                          )}
                          {op.maskVideoGcsUri && (
                            <span className="px-1.5 py-0.5 bg-violet-100 border border-violet-200 text-violet-700 text-[9px] font-bold rounded flex items-center gap-1">
                              Mask: {op.maskVideoGcsUri.split("/").pop()}
                            </span>
                          )}
                          {(op as any).inputFileSize != null && (
                            <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-500 text-[9px] font-bold rounded">
                              Input: {formatBytes((op as any).inputFileSize)}
                            </span>
                          )}
                          {(op as any).prompt && (
                            <p className="w-full text-[10px] text-slate-500 italic truncate mt-0.5">
                              "{(op as any).prompt}"
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-100 flex-wrap overflow-hidden">
                         <span className="text-[9px] font-mono text-slate-400 shrink-0">OP:</span>
                         <span className="text-[9px] font-mono text-slate-600 truncate">{op.name.split("/").pop()}</span>
                         <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusCheck(op);
                          }}
                          disabled={checkingIds.has(op.id)}
                          className="ml-auto p-1.5 bg-blue-500/10 text-blue-500 rounded hover:bg-blue-500 hover:text-white transition-all disabled:opacity-50"
                          title="Run Deep Status Check"
                         >
                            {checkingIds.has(op.id) ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <Search size={10} />
                            )}
                         </button>
                      </div>
                    </div>

                    {/* Action Area */}
                    <div className="shrink-0 flex flex-col items-end gap-2">
                       {op.status === "DONE" ? (
                         <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                            <CheckCircle2 size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Completed</span>
                         </div>
                       ) : op.status === "ERROR" ? (
                         <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-600 rounded-lg border border-red-100">
                            <XCircle size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Failed</span>
                         </div>
                       ) : (
                         <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                            <Loader2 size={12} className="animate-spin" />
                            <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Running</span>
                         </div>
                       )}
                    </div>
                  </div>

                  {/* Output Location / Error Area */}
                  <div className="pt-2 border-t border-slate-100">
                    {op.status === "ERROR" ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-500">
                          <AlertCircle size={14} />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Operation Error</span>
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-2 text-xs">
                          <div className="flex justify-between items-center text-[10px] text-red-400 font-bold uppercase">
                            <span>Diagnostic Message</span>
                            <span>Code: {op.error?.code || '???'}</span>
                          </div>
                          <p className="text-red-700 leading-relaxed font-medium break-words">
                            {op.error?.message || "Internal processing error occurred."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {(() => {
                          const gcsUri = getOutputGcsUri(op);
                          const fallbackUri = op.payload?.parameters?.storageUri;
                          const displayUri = gcsUri || fallbackUri || null;
                          const firebaseUrl = gcsUri ? gcsToFirebaseUrl(gcsUri) : null;

                          return (
                            <div className="space-y-2">
                              {/* Thumbnail for completed jobs — click to preview */}
                              {op.status === "DONE" && firebaseUrl && (
                                <div
                                  className="relative w-48 aspect-video rounded-lg overflow-hidden border border-slate-200 bg-black cursor-pointer group/thumb"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const origGcs = op.originalGcsUri || (op as any).inputGcsUri || op.payload?.instances?.[0]?.video?.gcsUri;
                                    const showSplit = (op.type === "upscale" || op.type === "transform") && !!origGcs;
                                    const left = op.type === "transform" ? "Input Video" : "Original Video";
                                    const right = op.type === "transform" ? "Transformed Output" : "4K Upscaled Output";
                                    onVideoSelect?.(firebaseUrl, showSplit ? gcsToFirebaseUrl(origGcs!) : undefined, left, right);
                                  }}
                                >
                                  <video
                                    src={firebaseUrl + "#t=0.5"}
                                    className="w-full h-full object-cover"
                                    preload="metadata"
                                    muted
                                    playsInline
                                  />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                    <div className="p-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30">
                                      <Video size={16} className="text-white" />
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* GCS path */}
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                                  <ExternalLink size={10} />
                                </div>
                                <div className="flex-1 bg-slate-50/50 px-2 py-1.5 rounded-lg border border-slate-100 min-w-0">
                                  <code className="text-[9px] text-slate-500 font-mono break-all">
                                    {displayUri || "Pending output..."}
                                  </code>
                                </div>
                                {displayUri && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(displayUri);
                                    }}
                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100 shrink-0"
                                    title="Copy GCS URI"
                                  >
                                    <Video size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>

                  {/* Inline status check result */}
                  {checkResults[op.id] && (
                    <div className="pt-2 border-t border-slate-100">
                      {checkResults[op.id].done ? (
                        checkResults[op.id].error ? (
                          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-[11px] text-red-700 font-medium">
                            {checkResults[op.id].error.message || "Operation failed."}
                          </div>
                        ) : (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Completed</p>
                            {(() => {
                              const uri = checkResults[op.id].response?.videos?.[0]?.gcsUri;
                              const url = uri ? gcsToFirebaseUrl(uri) : null;
                              return uri && url ? (
                                <>
                                  <div
                                    className="relative w-48 aspect-video rounded-lg overflow-hidden border border-emerald-200 bg-black cursor-pointer group/thumb mt-1"
                                    onClick={() => {
                                      const origGcs = op.originalGcsUri || (op as any).inputGcsUri || op.payload?.instances?.[0]?.video?.gcsUri;
                                      const showSplit = (op.type === "upscale" || op.type === "transform") && !!origGcs;
                                      const left = op.type === "transform" ? "Input Video" : "Original Video";
                                      const right = op.type === "transform" ? "Transformed Output" : "4K Upscaled Output";
                                      onVideoSelect?.(url, showSplit ? gcsToFirebaseUrl(origGcs!) : undefined, left, right);
                                    }}
                                  >
                                    <video src={url + "#t=0.5"} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                      <div className="p-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30">
                                        <Video size={14} className="text-white" />
                                      </div>
                                    </div>
                                  </div>
                                  <code className="text-[10px] text-emerald-800 font-mono break-all block mt-1">{uri}</code>
                                </>
                              ) : null;
                            })()}
                          </div>
                        )
                      ) : (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] text-blue-600 font-medium flex items-center gap-2">
                          <Loader2 size={12} className="animate-spin shrink-0" />
                          Still running — check again shortly.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="pt-2 flex justify-between items-center text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      Ref: <span className="font-mono">{op.id.slice(-6)}</span>
                    </span>
                    <span>{op.createdAt?.toDate().toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
  );
};

export default OperationsPanel;
