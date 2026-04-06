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
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
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

const OperationsPanel = ({ operations, hasMore, loadingMore, onLoadMore, addLog, onVideoSelect, onStatusUpdate }: OperationsPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [checkResults, setCheckResults] = useState<Record<string, any>>({});
  const [outputSizes, setOutputSizes] = useState<Record<string, number>>({});
  const { config } = useConfig();

  // Fetch output file sizes for completed operations
  useEffect(() => {
    operations.forEach(op => {
      if (op.status !== "DONE" || outputSizes[op.id] !== undefined) return;
      const gcsUri = op.result?.videos?.[0]?.gcsUri || op.result?.video?.gcsUri;
      if (!gcsUri) return;
      const withoutScheme = gcsUri.replace("gs://", "");
      const slashIdx = withoutScheme.indexOf("/");
      const bucket = withoutScheme.substring(0, slashIdx);
      const path = withoutScheme.substring(slashIdx + 1);
      const encodedPath = path.split("/").map(encodeURIComponent).join("%2F");
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
      fetch(url, { method: "HEAD" })
        .then(r => {
          const len = r.headers.get("content-length");
          if (len) setOutputSizes(prev => ({ ...prev, [op.id]: parseInt(len, 10) }));
        })
        .catch(() => {});
    });
  }, [operations]);

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
            <div className="p-3 space-y-2">
              {filteredOps.map((op) => {
                const gcsUri = getOutputGcsUri(op);
                const fallbackUri = op.payload?.parameters?.storageUri;
                const displayUri = gcsUri || fallbackUri || null;
                const firebaseUrl = gcsUri ? gcsToFirebaseUrl(gcsUri) : null;
                const duration = getDurationString(op);
                const createdAtDate = op.createdAt?.toDate?.()?.toLocaleString?.() ?? null;

                const borderColor =
                  op.status === "RUNNING" ? "border-l-blue-400" :
                  op.status === "DONE"    ? "border-l-emerald-400" :
                                           "border-l-red-400";

                const chipBase = "px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-semibold rounded border border-slate-200";
                const chipBlue = "px-1.5 py-0.5 bg-blue-50 text-blue-600 border-blue-100 text-[9px] font-semibold rounded border";

                return (
                  <div
                    key={op.id}
                    className={`bg-white border border-slate-200 border-l-4 ${borderColor} rounded-xl overflow-hidden`}
                  >
                    <div className="p-3 space-y-2">

                      {/* Header row */}
                      <div className="flex items-center gap-2">
                        {op.status === "RUNNING" ? (
                          <Loader2 size={12} className="text-blue-400 animate-spin shrink-0" />
                        ) : op.status === "DONE" ? (
                          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle size={12} className="text-red-400 shrink-0" />
                        )}
                        <span className="text-[12px] font-semibold text-slate-700 capitalize">{op.type}</span>
                        <div className="flex-1" />
                        {duration && (
                          <span
                            className="text-[10px] text-slate-400 font-mono"
                            title={createdAtDate ?? undefined}
                          >
                            {duration}
                          </span>
                        )}
                        {op.userEmail && (
                          <span className="text-[10px] text-slate-400 italic truncate max-w-[100px]">
                            {op.userEmail}
                          </span>
                        )}
                      </div>

                      {/* Param chips */}
                      {(() => {
                        const chips: React.ReactNode[] = [];
                        if ((op as any).resolution)
                          chips.push(<span key="res" className={chipBlue}>{(op as any).resolution}</span>);
                        if ((op as any).compressionQuality)
                          chips.push(<span key="cq" className={chipBlue}>{(op as any).compressionQuality.replace(/_/g, " ")}</span>);
                        if ((op as any).videoTransformStrength != null)
                          chips.push(<span key="str" className={chipBlue}>strength {Number((op as any).videoTransformStrength).toFixed(2)}</span>);
                        if ((op as any).numDiffusionSteps != null)
                          chips.push(<span key="steps" className={chipBlue}>{(op as any).numDiffusionSteps} steps</span>);
                        if ((op as any).inputFileSize != null)
                          chips.push(<span key="ifs" className={chipBase}>{formatBytes((op as any).inputFileSize)}</span>);
                        if ((op as any).prompt)
                          chips.push(<span key="prompt" className={`${chipBase} italic truncate w-full`}>"{(op as any).prompt}"</span>);
                        return chips.length > 0 ? (
                          <div className="flex flex-wrap gap-1">{chips}</div>
                        ) : null;
                      })()}

                      {/* Output section — DONE or has output */}
                      {(op.status === "DONE" || displayUri) && (
                        <div className="flex gap-2 items-start">
                          {firebaseUrl && (
                            <div
                              className="relative w-32 aspect-video shrink-0 rounded-md overflow-hidden bg-black cursor-pointer group/thumb"
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
                                className="w-full h-full object-contain"
                                preload="metadata"
                                muted
                                playsInline
                              />
                              {/* Output file size badge */}
                              {outputSizes[op.id] && (
                                <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded pointer-events-none">
                                  {formatBytes(outputSizes[op.id])}
                                </div>
                              )}
                              {/* Always-visible compare pill */}
                              <div className="absolute bottom-0 inset-x-0 flex items-center justify-center py-1 bg-gradient-to-t from-black/70 to-transparent">
                                <span className="flex items-center gap-1 text-[9px] font-bold text-white/90 tracking-wide">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                                  Compare
                                </span>
                              </div>
                              {/* Hover brighten */}
                              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                            </div>
                          )}
                          {displayUri && op.status === "DONE" && (
                            <div className="flex-1 min-w-0 flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(displayUri); }}
                                className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 hover:text-blue-500 border border-slate-200 rounded hover:border-blue-300 transition-colors"
                                title={displayUri}
                              >
                                <ExternalLink size={9} /> Copy GCS
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Error section */}
                      {op.status === "ERROR" && (
                        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[11px] text-red-600">
                          {op.error?.message || "Internal processing error occurred."}
                          {op.error?.code && <span className="ml-2 text-red-400 font-mono text-[9px]">({op.error.code})</span>}
                        </div>
                      )}

                      {/* Inline check result */}
                      {checkResults[op.id] && (
                        <div>
                          {checkResults[op.id].done ? (
                            checkResults[op.id].error ? (
                              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-[11px] text-red-600">
                                {checkResults[op.id].error.message || "Operation failed."}
                              </div>
                            ) : (() => {
                              const cUri = checkResults[op.id].response?.videos?.[0]?.gcsUri;
                              const cUrl = cUri ? gcsToFirebaseUrl(cUri) : null;
                              return (
                                <div className="flex gap-2 items-start">
                                  {cUrl && (
                                    <div
                                      className="relative w-32 aspect-video shrink-0 rounded-md overflow-hidden bg-black cursor-pointer group/thumb"
                                      onClick={() => {
                                        const origGcs = op.originalGcsUri || (op as any).inputGcsUri || op.payload?.instances?.[0]?.video?.gcsUri;
                                        const showSplit = (op.type === "upscale" || op.type === "transform") && !!origGcs;
                                        const left = op.type === "transform" ? "Input Video" : "Original Video";
                                        const right = op.type === "transform" ? "Transformed Output" : "4K Upscaled Output";
                                        onVideoSelect?.(cUrl, showSplit ? gcsToFirebaseUrl(origGcs!) : undefined, left, right);
                                      }}
                                    >
                                      <video src={cUrl + "#t=0.5"} className="w-full h-full object-contain" preload="metadata" muted playsInline />
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                        <Video size={14} className="text-white" />
                                      </div>
                                    </div>
                                  )}
                                  {cUri && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cUri); }}
                                      className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 hover:text-blue-500 border border-slate-200 rounded hover:border-blue-300 transition-colors self-start"
                                      title={cUri}
                                    >
                                      <ExternalLink size={9} /> Copy GCS
                                    </button>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-[11px] text-blue-600 flex items-center gap-2">
                              <Loader2 size={12} className="animate-spin shrink-0" />
                              Still running — check again shortly.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Operation ID + check button (check only for RUNNING) */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono text-slate-300 truncate flex-1">{op.name.split("/").pop()}</span>
                        {op.status === "RUNNING" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStatusCheck(op); }}
                            disabled={checkingIds.has(op.id)}
                            className="p-1 text-slate-300 hover:text-blue-500 transition-colors disabled:opacity-40"
                            title="Run Deep Status Check"
                          >
                            {checkingIds.has(op.id) ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <Search size={10} />
                            )}
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2 mt-1 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 bg-white"
                >
                  {loadingMore && <Loader2 size={12} className="animate-spin" />}
                  {loadingMore ? "Loading…" : "Load 10 more"}
                </button>
              )}
          </div>
        )}
      </div>
    )}
  </div>
  );
};

export default OperationsPanel;
