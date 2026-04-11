"use client";
import { useState, useRef, useCallback, useMemo } from "react";
import { collection, query, where, orderBy, limit, startAfter, getDocs, QueryConstraint, QueryDocumentSnapshot } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { COLLECTIONS, PAGE_SIZES } from "@/constants";

const PAGE_SIZE = PAGE_SIZES.VIDEOS;

export interface VideoItem {
  id: string;
  name: string;
  url: string;
  size?: number;
  aspectRatio?: string;
}

/** Ensure a Firebase Storage URL has a valid download token.
 *  URLs from user uploads already have tokens; Vertex AI outputs don't. */
async function resolveUrl(url: string): Promise<string> {
  if (!url) return url;
  // Already has a token — likely a user upload
  if (url.includes("token=")) return url;
  // Extract the storage path and get an authenticated URL
  try {
    const pathMatch = url.match(/\/o\/([^?]+)/);
    if (pathMatch) {
      const path = decodeURIComponent(pathMatch[1].replace(/%2F/g, "/"));
      const fileRef = ref(storage, path);
      return await getDownloadURL(fileRef);
    }
  } catch {
    // Fall back to original URL
  }
  return url;
}

async function resolveVideos(videos: VideoItem[]): Promise<VideoItem[]> {
  return Promise.all(
    videos.map(async (v) => {
      const url = await resolveUrl(v.url);
      return { ...v, url };
    })
  );
}

export function useVideoLibrary(
  currentProjectId: string | null,
  extraFilters: QueryConstraint[] = []
) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const extraFiltersKey = useMemo(() => JSON.stringify(extraFilters), [extraFilters]);

  const fetchVideos = useCallback(async () => {
    if (!currentProjectId) return;
    setLoadingAssets(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.VIDEOS),
        where("projectId", "==", currentProjectId),
        where("isUpscaleOutput", "==", false),
        ...extraFilters,
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
      const raw = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || "Untitled",
        url: d.data().url || "",
        size: d.data().size || undefined,
        aspectRatio: d.data().aspectRatio || undefined,
      }));
      setVideos(await resolveVideos(raw));
    } catch (e) {
      console.error("[useVideoLibrary] fetch videos failed:", e);
    } finally {
      setLoadingAssets(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, extraFiltersKey]);

  const loadMoreVideos = useCallback(async () => {
    if (!currentProjectId || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.VIDEOS),
        where("projectId", "==", currentProjectId),
        where("isUpscaleOutput", "==", false),
        ...extraFilters,
        orderBy("createdAt", "desc"),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
      const raw = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || "Untitled",
        url: d.data().url || "",
        size: d.data().size || undefined,
        aspectRatio: d.data().aspectRatio || undefined,
      }));
      const resolved = await resolveVideos(raw);
      setVideos(prev => [...prev, ...resolved]);
    } catch (e) {
      console.error("[useVideoLibrary] load more videos failed:", e);
    } finally {
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, extraFiltersKey]);

  return { videos, setVideos, loadingAssets, loadingMore, hasMore, fetchVideos, loadMoreVideos };
}
