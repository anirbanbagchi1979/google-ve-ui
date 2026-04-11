"use client";
import { useState, useCallback } from "react";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import { detectAspectRatioFromFile, validateVideoConstraints } from "@/utils/time";
import { getGcsUri } from "@/utils/gcs";

interface UseFileUploadConfig {
  storagePath: string;
  firestoreCollection?: string | null;
  accept: "video" | "image";
  projectId: string | null;
  onSuccess?: (url: string, gcsUri: string, file: File) => void | Promise<void>;
  extraDocFields?: Record<string, unknown>;
}

interface UseFileUploadReturn {
  upload: (file: File) => Promise<string | null>;
  isUploading: boolean;
  progress: number;
  error: string | null;
  clearError: () => void;
}

export function useFileUpload(config: UseFileUploadConfig): UseFileUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    // Validate file type
    const expectedPrefix = config.accept === "video" ? "video/" : "image/";
    if (!file.type.startsWith(expectedPrefix)) {
      setError(`Please select a valid ${config.accept} file.`);
      return null;
    }

    // Validate video constraints (duration, etc.)
    if (config.accept === "video") {
      const validationError = await validateVideoConstraints(file);
      if (validationError) {
        setError(validationError);
        return null;
      }
    }

    setIsUploading(true);
    setProgress(0);
    setError(null);

    // Detect aspect ratio for videos
    let detectedRatio: "16:9" | "9:16" | undefined;
    if (config.accept === "video") {
      detectedRatio = await detectAspectRatioFromFile(file);
    }

    return new Promise<string | null>((resolve) => {
      const storageRef = ref(storage, `${config.storagePath}/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);

      task.on(
        "state_changed",
        (snap) => setProgress((snap.bytesTransferred / snap.totalBytes) * 100),
        (err) => {
          setError("Upload failed: " + err.message);
          setIsUploading(false);
          resolve(null);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            const gcsUri = getGcsUri(url);

            // Save to Firestore if collection is specified
            if (config.firestoreCollection) {
              await addDoc(collection(db, config.firestoreCollection), {
                name: file.name,
                url,
                gcsUri,
                type: file.type,
                size: file.size,
                ...(detectedRatio ? { aspectRatio: detectedRatio } : {}),
                projectId: config.projectId,
                createdAt: serverTimestamp(),
                ...config.extraDocFields,
              });
            }

            await config.onSuccess?.(url, gcsUri, file);
            resolve(url);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            setError("Error saving: " + msg);
            resolve(null);
          } finally {
            setIsUploading(false);
          }
        }
      );
    });
  }, [config.storagePath, config.firestoreCollection, config.accept, config.projectId, config.extraDocFields, config.onSuccess]);

  const clearError = useCallback(() => setError(null), []);

  return { upload, isUploading, progress, error, clearError };
}
