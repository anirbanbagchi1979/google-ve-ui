import { useState, useCallback, useEffect } from "react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PerfCharacter } from "@/types";

export function usePerfCharacterLibrary(projectId: string | null) {
  const [characters, setCharacters] = useState<PerfCharacter[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCharacters = useCallback(async () => {
    if (!projectId) {
      setCharacters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, "perfCharacters"),
        where("projectId", "==", projectId),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      setCharacters(
        snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
        } as PerfCharacter))
      );
    } catch (e) {
      console.error("Error fetching perfCharacters", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  return { characters, loading, fetchCharacters };
}
