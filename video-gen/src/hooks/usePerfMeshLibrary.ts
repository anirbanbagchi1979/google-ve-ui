import { useState, useCallback, useEffect } from "react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PerfMesh } from "@/types";

export function usePerfMeshLibrary(projectId: string | null) {
  const [meshes, setMeshes] = useState<PerfMesh[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeshes = useCallback(async () => {
    if (!projectId) {
      setMeshes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, "perfMeshes"),
        where("projectId", "==", projectId),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      setMeshes(
        snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
        } as PerfMesh))
      );
    } catch (e) {
      console.error("Error fetching perfMeshes", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMeshes();
  }, [fetchMeshes]);

  return { meshes, loading, fetchMeshes };
}
