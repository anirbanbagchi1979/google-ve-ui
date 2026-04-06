import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp,
  doc,
  updateDoc,
  where,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { gcsToFirebaseUrl } from "@/utils/gcs";
import { useConfig } from "@/context/ConfigContext";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { proxyFetch } from "@/lib/proxyFetch";

const OPS_PAGE_SIZE = 10;

export function useGenerationFlow(setActiveView: (view: string) => void) {
  const [operations, setOperations] = useState<any[]>([]);
  const [hasMoreOps, setHasMoreOps] = useState(false);
  const [loadingMoreOps, setLoadingMoreOps] = useState(false);
  const lastOpDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const { config } = useConfig();
  const { user, getIdToken } = useAuth();
  const { currentProjectId } = useProject();

  const addLog = (log: any) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      ...log
    }, ...prev].slice(0, 50));
  };

  // 1. Initial Load Operations — paginated at OPS_PAGE_SIZE, real-time for first page
  useEffect(() => {
    if (!currentProjectId) {
      setOperations([]);
      setHasMoreOps(false);
      lastOpDocRef.current = null;
      return;
    }
    const q = query(
      collection(db, "operations"),
      where("projectId", "==", currentProjectId),
      orderBy("createdAt", "desc"),
      limit(OPS_PAGE_SIZE)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      lastOpDocRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
      setHasMoreOps(snapshot.docs.length === OPS_PAGE_SIZE);
      setOperations(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [currentProjectId]);

  // Load next page of operations (no real-time for older pages)
  const loadMoreOps = useCallback(async () => {
    if (!currentProjectId || !lastOpDocRef.current) return;
    setLoadingMoreOps(true);
    try {
      const q = query(
        collection(db, "operations"),
        where("projectId", "==", currentProjectId),
        orderBy("createdAt", "desc"),
        startAfter(lastOpDocRef.current),
        limit(OPS_PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastOpDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMoreOps(snap.docs.length === OPS_PAGE_SIZE);
      setOperations(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
    } finally {
      setLoadingMoreOps(false);
    }
  }, [currentProjectId]);

  // 2. Background Polling Service for Incomplete Tasks
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const runningOps = operations.filter(op => op.status === "RUNNING");
      
      for (const op of runningOps) {
        try {
          const modelName = op.modelUsed || (op.type === "upscale" ? config.upscaleModel : config.videoGenModel);
          const endpoint = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${modelName}:fetchPredictOperation`;

          const response = await proxyFetch(getIdToken, { endpoint, payload: { operationName: op.name } });
          const data = await response.json();

          if (data.done) {
            if (data.error) {
              await updateDoc(doc(db, "operations", op.id), {
                status: "ERROR",
                updatedAt: Timestamp.now(),
                completedAt: Timestamp.now(),
                error: data.error
              });
              addLog({ type: "ERROR", message: `Operation Failed: ${op.id}`, operationId: op.name, details: data.error });
            } else {
              await updateDoc(doc(db, "operations", op.id), {
                status: "DONE",
                updatedAt: Timestamp.now(),
                completedAt: Timestamp.now(),
                result: data.response
              });
              // Save all LRO outputs to the videos library for reuse.
              // isUpscaleOutput: true on upscale results → UpscalePanel filters
              // them out server-side so already-upscaled videos can't be re-upscaled.
              if (op.type === "upscale" || op.type === "transform") {
                const outputGcsUri = data.response?.videos?.[0]?.gcsUri;
                if (outputGcsUri) {
                  await addDoc(collection(db, "videos"), {
                    name: op.type === "upscale" ? "Upscale output" : "Transform output",
                    url: gcsToFirebaseUrl(outputGcsUri),
                    type: "video/mp4",
                    isUpscaleOutput: op.type === "upscale",
                    projectId: op.projectId,
                    createdAt: Timestamp.now(),
                  });
                }
              }
              addLog({ type: "FLOW", message: `Operation Complete: ${op.id}`, operationId: op.name });
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [operations, config]);

  // 3. Generation Flow
  const handleGenerate = async (payload: any, isLongRunning: boolean = false) => {
    addLog({
      type: "REQUEST",
      message: isLongRunning ? "Starting LRO Task" : "Generating Frames",
      endpoint: "Vertex AI API",
      payload: payload
    });

    // Extract all generation parameters as top-level fields for easy querying
    const instance = payload?.instances?.[0] || {};
    const params = payload?.parameters || {};
    const extractedParams = {
      prompt: instance.prompt || null,
      durationSeconds: params.durationSeconds || null,
      aspectRatio: params.aspectRatio || null,
      sampleCount: params.sampleCount || null,
      compressionQuality: params.compressionQuality || null,
      resolution: params.resolution || null,
      fps: instance.fps || null,
      inputType: instance.video ? "video" : instance.referenceImages ? "image" : null,
      inputGcsUri: instance.video?.gcsUri || instance.referenceImages?.[0]?.image?.gcsUri || null,
      maskVideoGcsUri: params.experiments?.videoTransformMaskGcsUri || null,
      videoTransformStrength: params.experiments?.videoTransformStrength ?? null,
      numDiffusionSteps: params.experiments?.numDiffusionSteps ?? null,
      inputFileSize: (payload._inputFileSize as number | null) ?? null,
    };

    try {
      const { _model: metaModel, _inputFileSize: inputFileSize, ...apiPayload } = payload;
      const experimentModel = params.experiments?.modelName;
      const modelUsed = experimentModel === 'veo3p1_upscale'
        ? config.upscaleModel
        : metaModel || experimentModel || config.videoGenModel;
      const endpoint = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${modelUsed}${isLongRunning ? ':predictLongRunning' : ':predict'}`;

      const response = await proxyFetch(getIdToken, { endpoint, payload: apiPayload });

      const data = await response.json();

      const operationType = params.task || (metaModel === "veo-experimental" ? "transform" : "generation");

      if (isLongRunning && data.name) {
        await addDoc(collection(db, "operations"), {
          name: data.name,
          status: "RUNNING",
          type: operationType,
          userEmail: user?.email,
          projectId: currentProjectId,
          createdAt: Timestamp.now(),
          payload: payload,
          modelUsed: modelUsed,
          ...extractedParams
        });

        setActiveView("tasks");

        addLog({
          type: "FLOW",
          message: "LRO Task Queued to Firestore",
          operationId: data.name
        });
      } else if (!isLongRunning) {
        await addDoc(collection(db, "operations"), {
          name: null,
          status: data.error ? "ERROR" : "DONE",
          type: operationType,
          userEmail: user?.email,
          projectId: currentProjectId,
          createdAt: Timestamp.now(),
          completedAt: Timestamp.now(),
          payload: payload,
          modelUsed: modelUsed,
          result: data.error ? null : data,
          error: data.error || null,
          ...extractedParams
        });
      }

      addLog({
        type: "RESPONSE",
        status: response.status,
        message: isLongRunning ? "LRO Started" : "Frames Generated",
        data: data
      });
    } catch (error: any) {
      addLog({
        type: "ERROR",
        message: "Generation Failed",
        details: error.message
      });
    }
  };

  const updateOperationStatus = async (id: string, status: "DONE" | "ERROR", result?: any, error?: any) => {
    await updateDoc(doc(db, "operations", id), {
      status,
      updatedAt: Timestamp.now(),
      ...(status === "DONE" || status === "ERROR" ? { completedAt: Timestamp.now() } : {}),
      ...(result ? { result } : {}),
      ...(error ? { error } : {})
    });
  };

  return {
    operations,
    hasMoreOps,
    loadingMoreOps,
    loadMoreOps,
    logs,
    setLogs,
    addLog,
    handleGenerate,
    updateOperationStatus
  };
}
