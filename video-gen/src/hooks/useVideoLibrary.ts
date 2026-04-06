"use client";
import { useState, useRef, useCallback } from "react";
import { collection, query, where, orderBy, limit, startAfter, getDocs, QueryConstraint, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

const PAGE_SIZE = 4;

export interface VideoItem {
  id: string;
  name: string;
  url: string;
  size?: number;
  aspectRatio?: string;
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

  const fetchVideos = useCallback(async () => {
    if (!currentProjectId) return;
    setLoadingAssets(true);
    try {
      const q = query(
        collection(db, "videos"),
        where("projectId", "==", currentProjectId),
        ...extraFilters,
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
      setVideos(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || "Untitled",
        url: d.data().url || "",
        size: d.data().size || undefined,
        aspectRatio: d.data().aspectRatio || undefined,
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAssets(false);
    }
  }, [currentProjectId, JSON.stringify(extraFilters)]);

  const loadMoreVideos = useCallback(async () => {
    if (!currentProjectId || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "videos"),
        where("projectId", "==", currentProjectId),
        ...extraFilters,
        orderBy("createdAt", "desc"),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
      setVideos(prev => [...prev, ...snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || "Untitled",
        url: d.data().url || "",
        size: d.data().size || undefined,
        aspectRatio: d.data().aspectRatio || undefined,
      }))]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }, [currentProjectId, JSON.stringify(extraFilters)]);

  return { videos, setVideos, loadingAssets, loadingMore, hasMore, fetchVideos, loadMoreVideos };
}
