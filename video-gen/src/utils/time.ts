// src/utils/time.ts
import type { Operation } from "@/types";

/**
 * Returns a human-readable duration string for an operation.
 */
export const getDurationString = (op: Operation, now: number = Date.now()): string | null => {
  if (!op.createdAt) return null;
  const start = op.createdAt.toMillis();
  let end: number;

  if (op.completedAt) {
    end = op.completedAt.toMillis();
  } else if (op.status === "DONE" || op.status === "ERROR") {
    end = op.updatedAt?.toMillis() ?? now;
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
 * Get the exact pixel dimensions of a video from a URL.
 */
export const getVideoDimensions = (url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => {
      resolve({ width: vid.videoWidth, height: vid.videoHeight });
      vid.src = "";
    };
    vid.onerror = () => { reject(new Error("Failed to load video metadata")); };
    vid.src = url;
  });

/**
 * Resize an image file to match target dimensions.
 * Centers and crops the image to fill the target aspect ratio exactly,
 * then scales to the target pixel size.
 * Returns a new File with the resized image.
 */
export const resizeImageToMatchVideo = (
  file: File,
  targetWidth: number,
  targetHeight: number
): Promise<File> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }

      // Cover-crop: scale image to fill target, then center-crop
      const targetRatio = targetWidth / targetHeight;
      const imgRatio = img.naturalWidth / img.naturalHeight;

      let sx: number, sy: number, sw: number, sh: number;
      if (imgRatio > targetRatio) {
        // Image is wider — crop sides
        sh = img.naturalHeight;
        sw = sh * targetRatio;
        sx = (img.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        // Image is taller — crop top/bottom
        sw = img.naturalWidth;
        sh = sw / targetRatio;
        sx = 0;
        sy = (img.naturalHeight - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Failed to create blob")); return; }
          const resizedFile = new File([blob], file.name, { type: mimeType });
          resolve(resizedFile);
        },
        mimeType,
        mimeType === "image/jpeg" ? 0.95 : undefined
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });

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
 * Validate that a video file meets the API constraints:
 * ≤ 192 frames at 24fps (= max 8 seconds).
 * Returns null if valid, or an error message string if invalid.
 */
export const validateVideoConstraints = (file: File): Promise<string | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      vid.src = "";
      const MAX_DURATION = 192 / 24; // 8 seconds
      if (vid.duration > MAX_DURATION) {
        resolve(`Video is ${vid.duration.toFixed(1)}s — max is 8s (192 frames at 24fps).`);
      } else {
        resolve(null);
      }
    };
    vid.onerror = () => { URL.revokeObjectURL(url); resolve("Could not read video metadata."); };
    vid.src = url;
  });

/**
 * Generate a filesystem-safe timestamp string (e.g. "2026-04-09_14-30-00").
 */
export const generateTimestamp = (): string =>
  new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");

/**
 * Format seconds as MM:SS string.
 */
export const formatTime = (time: number): string => {
  const m = Math.floor(time / 60).toString().padStart(2, "0");
  const s = Math.floor(time % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};
