import { useState, useCallback, useEffect, useRef } from "react";
import { collection, query, where, orderBy, limit, getDocs, startAfter, QueryDocumentSnapshot } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { PerfMesh } from "@/types";
import { COLLECTIONS, PAGE_SIZES } from "@/constants";

const MESH_PAGE_SIZE = PAGE_SIZES.MESHES;

export function usePerfMeshLibrary(projectId: string | null) {
  const [meshes, setMeshes] = useState<PerfMesh[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);

  const resolveUrls = async (rawMeshes: PerfMesh[]): Promise<PerfMesh[]> => {
    // Resolve authenticated download URLs for mesh videos
    const resolved = await Promise.all(
      rawMeshes.map(async (mesh) => {
        try {
          const path = mesh.gcsUri.replace(/^gs:\/\/[^/]+\//, "");
          const fileRef = ref(storage, path);
          const url = await getDownloadURL(fileRef);
          return { ...mesh, url };
        } catch {
          return mesh;
        }
      })
    );

    // Also resolve sourceVideoUrl if present
    return Promise.all(
      resolved.map(async (mesh) => {
        if (!mesh.sourceVideoUrl) return mesh;
        try {
          const path = mesh.sourceVideoUrl.match(/\/o\/([^?]+)/)?.[1];
          if (path) {
            const fileRef = ref(storage, decodeURIComponent(path.replace(/%2F/g, "/")));
            const url = await getDownloadURL(fileRef);
            return { ...mesh, sourceVideoUrl: url };
          }
          return mesh;
        } catch {
          return mesh;
        }
      })
    );
  };

  const fetchMeshes = useCallback(async () => {
    if (!projectId) {
      setMeshes([]);
      setLoading(false);
      setHasMore(false);
      lastDocRef.current = null;
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.PERF_MESHES),
        where("projectId", "==", projectId),
        orderBy("createdAt", "desc"),
        limit(MESH_PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === MESH_PAGE_SIZE);

      const rawMeshes = snap.docs.map(d => ({ id: d.id, ...d.data() } as PerfMesh));
      setMeshes(await resolveUrls(rawMeshes));
    } catch (e) {
      console.error("Error fetching perfMeshes", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadMoreMeshes = useCallback(async () => {
    if (!projectId || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.PERF_MESHES),
        where("projectId", "==", projectId),
        orderBy("createdAt", "desc"),
        startAfter(lastDocRef.current),
        limit(MESH_PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === MESH_PAGE_SIZE);

      const rawMeshes = snap.docs.map(d => ({ id: d.id, ...d.data() } as PerfMesh));
      const resolved = await resolveUrls(rawMeshes);
      setMeshes(prev => [...prev, ...resolved]);
    } catch (e) {
      console.error("Error loading more perfMeshes", e);
    } finally {
      setLoadingMore(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMeshes();
  }, [fetchMeshes]);

  return { meshes, loading, loadingMore, hasMore, fetchMeshes, loadMoreMeshes };
}
