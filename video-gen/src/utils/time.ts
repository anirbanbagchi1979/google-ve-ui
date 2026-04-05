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
 * Format seconds as MM:SS string.
 */
export const formatTime = (time: number): string => {
  const m = Math.floor(time / 60).toString().padStart(2, "0");
  const s = Math.floor(time % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};
