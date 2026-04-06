// src/utils/time.ts
import type { Operation } from "@/types";

/**
 * Returns a human-readable duration string for an operation.
 */
export const getDurationString = (op: Operation, now: number = Date.now()): string | null => {
  if (!op.createdAt) return null;
  const start = op.createdAt.seconds ? op.createdAt.seconds * 1000 : new Date(op.createdAt).getTime();
  let end: number;

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

/**
 * Format bytes as a human-readable string (KB, MB, GB).
 */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + " GB";
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
};

/**
 * Detect video aspect ratio from a File object by loading metadata.
 */
export const detectAspectRatioFromFile = (file: File): Promise<"16:9" | "9:16"> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => {
      resolve(vid.videoWidth >= vid.videoHeight ? "16:9" : "9:16");
      URL.revokeObjectURL(url);
      vid.src = "";
    };
    vid.onerror = () => { resolve("16:9"); URL.revokeObjectURL(url); };
    vid.src = url;
  });

/**
 * Format seconds as MM:SS string.
 */
export const formatTime = (time: number): string => {
  const m = Math.floor(time / 60).toString().padStart(2, "0");
  const s = Math.floor(time % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};
