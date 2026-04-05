// src/services/assets.ts
import { ref, listAll, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, addDoc, getDocs, query, where, limit, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import type { VideoAsset } from "@/types";

/**
 * Fetch all images from Firebase Storage root.
 */
export const fetchImages = async (): Promise<string[]> => {
  const listRef = ref(storage, "/");
  const res = await listAll(listRef);
  return Promise.all(res.items.map((itemRef) => getDownloadURL(itemRef)));
};

/**
 * Fetch videos for a project from Firestore.
 */
export const fetchVideos = async (projectId: string, maxResults = 20): Promise<VideoAsset[]> => {
  const snap = await getDocs(
    query(
      collection(db, "videos"),
      where("projectId", "==", projectId),
      limit(maxResults)
    )
  );
  return snap.docs
    .map((d) => ({
      id: d.id,
      name: d.data().name || "Untitled",
      url: d.data().url || "",
      createdAt: d.data().createdAt,
    }))
    .reverse();
};

/**
 * Upload a video file to Firebase Storage and save a record to Firestore.
 * Returns the download URL.
 */
export const uploadVideo = (
  file: File,
  projectId: string | null,
  onProgress: (pct: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, `videos/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snap) => onProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "videos"), {
            name: file.name,
            url,
            type: file.type,
            size: file.size,
            projectId,
            createdAt: serverTimestamp(),
          });
          resolve(url);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
};
