"use client";

import React, { useState, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  RotateCcw,
  ListChecks,
} from "lucide-react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS, PAGE_SIZES } from "@/constants";
import { useProject } from "@/context/ProjectContext";
import type { Operation } from "@/types";

type PerfOperation = Operation;

interface PerfJobTrackerProps {
  onMeshReady?: (meshGcsUri: string, meshUrl: string, sourceVideoUrl?: string, operationId?: string) => void;
  onOutputReady?: (outputUrl: string, meshUrl?: string, sourceVideoUrl?: string) => void;
  onPreviewVideo?: (url: string, originalUrl?: string, leftLabel?: string, rightLabel?: string) => void;
  onRetry?: (op: PerfOperation) => void;
  onNavigateToTasks?: () => void;
}

const PerfJobTracker = ({
  onMeshReady,
  onOutputReady,
  onPreviewVideo,
  onRetry,
  onNavigateToTasks,
}: PerfJobTrackerProps) => {
  const { currentProjectId } = useProject();
  const [perfOps, setPerfOps] = useState<PerfOperation[]>([]);

  useEffect(() => {
    if (!currentProjectId) {
      setPerfOps([]);
      return;
    }
    const q = query(
      collection(db, COLLECTIONS.OPERATIONS),
      where("projectId", "==", currentProjectId),
      where("type", "in", ["perf-estimation", "perf-generation"]),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZES.PERF_TRACKER)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPerfOps(snap.docs.map(d => ({ id: d.id, ...d.data() } as PerfOperation)));
    });
    return () => unsub();
  }, [currentProjectId]);

  if (perfOps.length === 0) return null;

  return (
    <div className="space-y-1.5 p-3 bg-slate-50 border-b border-slate-200">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Recent Jobs</span>
        {onNavigateToTasks && (
          <button
            onClick={onNavigateToTasks}
            className="text-[9px] font-semibold text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-0.5"
          >
            <ListChecks size={9} /> All Tasks
          </button>
        )}
      </div>

      {perfOps.map(op => (
        <PerfJobRow
          key={op.id}
          op={op}
          onMeshReady={onMeshReady}
          onOutputReady={onOutputReady}
          onPreviewVideo={onPreviewVideo}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
};

const PerfJobRow = ({
  op,
  onMeshReady,
  onOutputReady,
  onPreviewVideo,
  onRetry,
}: {
  op: PerfOperation;
  onMeshReady?: PerfJobTrackerProps["onMeshReady"];
  onOutputReady?: PerfJobTrackerProps["onOutputReady"];
  onPreviewVideo?: PerfJobTrackerProps["onPreviewVideo"];
  onRetry?: PerfJobTrackerProps["onRetry"];
}) => {
  const [elapsed, setElapsed] = useState("");
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (op.status !== "RUNNING") return;
    const update = () => {
      const start = op.createdAt?.seconds ? op.createdAt.seconds * 1000 : Date.now();
      const diff = Math.floor((Date.now() - start) / 1000);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setElapsed(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [op.status, op.createdAt]);

  const label = op.type === "perf-estimation" ? "Mesh Extraction" : "Character Gen";

  const handleClick = () => {
    if (op.status === "RUNNING") {
      // Preview source video
      const sourceUrl = op.inputVideoUrl || null;
      if (sourceUrl) onPreviewVideo?.(sourceUrl, undefined, "Source Video", "");
    } else if (op.status === "DONE" && op.type === "perf-estimation") {
      // Preview mesh + prime step 2
      const meshUrl = op.outputVideoUrl;
      const sourceUrl = op.inputVideoUrl;
      if (meshUrl && sourceUrl) {
        onPreviewVideo?.(meshUrl, sourceUrl, "Source Video", "Blue Mesh");
      }
      if (meshUrl && op.outputGcsUri) {
        onMeshReady?.(op.outputGcsUri, meshUrl, op.inputVideoUrl, op.id);
      }
    } else if (op.status === "DONE" && op.type === "perf-generation") {
      // Preview final output
      const outputUrl = op.outputVideoUrl;
      const sourceUrl = op.sourceVideoUrl || op.inputVideoUrl;
      if (outputUrl) {
        onPreviewVideo?.(outputUrl, sourceUrl || undefined, "Source Video", "Performance Output");
        onOutputReady?.(outputUrl, op.meshVideoUrl || undefined, sourceUrl || undefined);
      }
    } else if (op.status === "ERROR") {
      setShowError(prev => !prev);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-[11px] ${
          op.status === "DONE" ? "bg-white border border-slate-200 hover:border-blue-300" :
          op.status === "ERROR" ? "bg-red-50 border border-red-200 hover:border-red-300" :
          "bg-blue-50 border border-blue-200"
        }`}
      >
        {op.status === "RUNNING" && <Loader2 size={12} className="text-blue-500 animate-spin shrink-0" />}
        {op.status === "DONE" && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
        {op.status === "ERROR" && <XCircle size={12} className="text-red-500 shrink-0" />}

        <span className="font-semibold text-slate-700 truncate flex-1">{label}</span>

        {op.status === "RUNNING" && (
          <span className="text-[10px] text-blue-500 font-mono shrink-0">{elapsed}</span>
        )}
        {op.status === "DONE" && op.type === "perf-estimation" && (
          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
            Use → Step 2
          </span>
        )}
        {op.status === "DONE" && op.type === "perf-generation" && (
          <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
            Preview
          </span>
        )}
        {op.status === "ERROR" && (
          <ChevronRight size={10} className={`text-red-400 shrink-0 transition-transform ${showError ? "rotate-90" : ""}`} />
        )}
      </div>

      {showError && op.status === "ERROR" && (
        <div className="mt-1 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 space-y-1.5">
          <p>{op.error?.message || "Processing failed."}</p>
          {onRetry && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(op); }}
              className="flex items-center gap-1 text-[9px] font-bold text-red-500 hover:text-red-700 transition-colors"
            >
              <RotateCcw size={9} /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PerfJobTracker;
