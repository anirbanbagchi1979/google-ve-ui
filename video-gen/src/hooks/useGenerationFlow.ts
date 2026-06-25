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
import { db, storage } from "@/lib/firebase";
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { gcsToFirebaseUrl } from "@/utils/gcs";
import { useConfig } from "@/context/ConfigContext";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { COLLECTIONS, PAGE_SIZES, DEFAULTS, MODELS } from "@/constants";
import type { Operation, Log, GenerationPayload } from "@/types";

const OPS_PAGE_SIZE = PAGE_SIZES.OPERATIONS;

/** Convert a gs:// URI to an authenticated Firebase download URL */
async function getAuthenticatedUrl(gcsUri: string): Promise<string> {
  // Extract the path after the bucket name
  const withoutScheme = gcsUri.replace("gs://", "");
  const slashIdx = withoutScheme.indexOf("/");
  const path = withoutScheme.substring(slashIdx + 1);
  const fileRef = storageRef(storage, path);
  return getDownloadURL(fileRef);
}

export function useGenerationFlow(setActiveView: (view: string) => void) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [hasMoreOps, setHasMoreOps] = useState(false);
  const [loadingMoreOps, setLoadingMoreOps] = useState(false);
  const lastOpDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const { config } = useConfig();
  const { user } = useAuth();
  const { currentProjectId } = useProject();

  const operationsRef = useRef<Operation[]>([]);
  const configRef = useRef(config);

  const addLog = (log: Omit<Log, "id" | "timestamp">) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      ...log
    }, ...prev].slice(0, PAGE_SIZES.MAX_LOGS));
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
      collection(db, COLLECTIONS.OPERATIONS),
      where("projectId", "==", currentProjectId),
      orderBy("createdAt", "desc"),
      limit(OPS_PAGE_SIZE)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      lastOpDocRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
      setHasMoreOps(snapshot.docs.length === OPS_PAGE_SIZE);
      const ops = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Operation));
      setOperations(ops);
      operationsRef.current = ops;
    });
    return () => unsubscribe();
  }, [currentProjectId]);

  // Load next page of operations (no real-time for older pages)
  const loadMoreOps = useCallback(async () => {
    if (!currentProjectId || !lastOpDocRef.current) return;
    setLoadingMoreOps(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.OPERATIONS),
        where("projectId", "==", currentProjectId),
        orderBy("createdAt", "desc"),
        startAfter(lastOpDocRef.current),
        limit(OPS_PAGE_SIZE)
      );
      const snap = await getDocs(q);
      lastOpDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMoreOps(snap.docs.length === OPS_PAGE_SIZE);
      const more = snap.docs.map(d => ({ id: d.id, ...d.data() } as Operation));
      setOperations(prev => [...prev, ...more]);
      operationsRef.current = [...operationsRef.current, ...more];
    } finally {
      setLoadingMoreOps(false);
    }
  }, [currentProjectId]);

  useEffect(() => { configRef.current = config; }, [config]);

  // 2. Background Polling Service for Incomplete Tasks
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const runningOps = operationsRef.current.filter(op => op.status === "RUNNING");
      
      for (const op of runningOps) {
        try {
          const modelName = op.modelUsed || (op.type === "upscale" ? configRef.current.upscaleModel : (op.type === "perf-estimation" || op.type === "perf-generation" || op.type === "a2v-generation" || op.type === "texture-generation" || op.type === "keyframe-generation") ? MODELS.EXPERIMENTAL : configRef.current.videoGenModel);
          const endpoint = `https://${configRef.current.location}-aiplatform.googleapis.com/v1/projects/${configRef.current.projectId}/locations/${configRef.current.location}/publishers/google/models/${modelName}:fetchPredictOperation`;

          const response = await fetch("/api/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint, payload: { operationName: op.name } })
          });
          const data = await response.json();

          if (data.done) {
            if (data.error) {
              await updateDoc(doc(db, COLLECTIONS.OPERATIONS, op.id), {
                status: "ERROR",
                updatedAt: Timestamp.now(),
                completedAt: Timestamp.now(),
                error: data.error
              });
              addLog({ type: "ERROR", message: `Operation Failed: ${op.id}`, operationId: op.name, details: data.error });
            } else {
              await updateDoc(doc(db, COLLECTIONS.OPERATIONS, op.id), {
                status: "DONE",
                updatedAt: Timestamp.now(),
                completedAt: Timestamp.now(),
                result: data.response
              });
              // Save LRO outputs to appropriate collections.
              // The API returns two video entries — prefer the one with mimeType (has .mp4 extension)
              const videos: Array<{ gcsUri?: string; mimeType?: string }> = data.response?.videos || [];
              addLog({ type: "FLOW", message: `Videos array (${videos.length} entries)`, data: { videos } });
              const outputGcsUri: string | undefined =
                videos.find(v => v.mimeType === "video/mp4")?.gcsUri ||
                (videos[0]?.gcsUri ? videos[0].gcsUri + ".mp4" : undefined);

              if ((op.type === "upscale" || op.type === "transform" || op.type === "perf-generation" || op.type === "a2v-generation" || op.type === "texture-generation" || op.type === "keyframe-generation") && outputGcsUri) {
                // Regular video outputs → videos collection
                let outputUrl: string;
                try { outputUrl = await getAuthenticatedUrl(outputGcsUri); } catch { outputUrl = gcsToFirebaseUrl(outputGcsUri); }
                await addDoc(collection(db, COLLECTIONS.VIDEOS), {
                  name: op.type === "upscale" ? "Upscale output"
                    : op.type === "transform" ? "Transform output"
                    : op.type === "a2v-generation" ? "Dialogue output"
                    : op.type === "texture-generation" ? "Texture output"
                    : op.type === "keyframe-generation" ? "Keyframe output"
                    : "Performance output",
                  url: outputUrl,
                  type: "video/mp4",
                  isUpscaleOutput: op.type === "upscale",
                  projectId: op.projectId,
                  createdAt: Timestamp.now(),
                });
                // Store output URLs on the operation for easy access
                await updateDoc(doc(db, COLLECTIONS.OPERATIONS, op.id), {
                  outputGcsUri,
                  outputVideoUrl: outputUrl,
                });
              }

              if (op.type === "perf-estimation" && outputGcsUri) {
                // Mesh outputs → perfMeshes collection only (NOT videos)
                let outputUrl: string;
                try { outputUrl = await getAuthenticatedUrl(outputGcsUri); } catch { outputUrl = gcsToFirebaseUrl(outputGcsUri); }
                const meshDoc = await addDoc(collection(db, COLLECTIONS.PERF_MESHES), {
                  name: `Mesh from ${op.inputVideoUrl ? "uploaded video" : "source"}`,
                  url: outputUrl,
                  gcsUri: outputGcsUri,
                  sourceVideoUrl: op.inputVideoUrl || null,
                  sourceVideoGcsUri: op.inputGcsUri || null,
                  sourceOperationId: op.id,
                  projectId: op.projectId,
                  createdAt: Timestamp.now(),
                });
                await updateDoc(doc(db, COLLECTIONS.OPERATIONS, op.id), {
                  outputGcsUri,
                  outputVideoUrl: outputUrl,
                  perfMeshDocId: meshDoc.id,
                });
              }
              addLog({ type: "FLOW", message: `Operation Complete: ${op.id}`, operationId: op.name });
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }
    }, (Number(configRef.current.pollIntervalSeconds) || DEFAULTS.POLL_INTERVAL_SECONDS) * 1000);

    return () => clearInterval(pollInterval);
  }, []);

  // 3. Generation Flow
  const handleGenerate = async (payload: GenerationPayload, isLongRunning: boolean = false) => {
    addLog({
      type: "REQUEST",
      message: isLongRunning ? "Starting LRO Task" : "Generating Frames",
      endpoint: "Vertex AI API",
      payload: payload
    });

    // Extract all generation parameters as top-level fields for easy querying
    const instance = payload?.instances?.[0] || {};
    const params = payload?.parameters || {};
    const experiments = (params.experiments || {}) as Record<string, unknown>;
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
      maskVideoGcsUri: (experiments.videoTransformMaskGcsUri as string | undefined) || null,
      videoTransformStrength: (experiments.videoTransformStrength as number | undefined) ?? null,
      numDiffusionSteps: (experiments.numDiffusionSteps as number | undefined) ?? null,
      inputFileSize: payload._inputFileSize ?? null,
      // Performance-specific metadata
      inputVideoUrl: payload._inputVideoUrl || null,
      meshGcsUri: (experiments.perfMeshGcsUri as string | undefined) || null,
      meshVideoUrl: payload._meshVideoUrl || null,
      characterImageGcsUri: instance.referenceImages?.[0]?.image?.gcsUri || null,
      characterImageUrl: payload._characterImageUrl || null,
      sourceVideoUrl: payload._sourceVideoUrl || null,
      // Audio-to-Video (dialogue) specific metadata
      audioGcsUri: instance.referenceAudios?.[0]?.audio?.gcsUri || null,
      audioUrl: payload._audioUrl || null,
      imageGcsUri: instance.image?.gcsUri || null,
      imageUrl: payload._imageUrl || null,
      sharpness: instance.sharpness ?? null,
      // Video Textures specific metadata
      loop: ((experiments.seamless as Record<string, unknown> | undefined)?.loop as boolean | undefined) ?? null,
      tessellateHorizontal: ((experiments.seamless as Record<string, unknown> | undefined)?.tessellateHorizontal as boolean | undefined) ?? null,
      tessellateVertical: ((experiments.seamless as Record<string, unknown> | undefined)?.tessellateVertical as boolean | undefined) ?? null,
      startFrameGcsUri: instance.image?.gcsUri || null,
      startFrameUrl: payload._startFrameUrl || null,
      lastFrameGcsUri: instance.lastFrame?.gcsUri || null,
      lastFrameUrl: payload._lastFrameUrl || null,
      // Multi-Keyframe specific metadata
      conditioningFrameCount: ((experiments.conditioningFrames as unknown[]) || []).length || null,
    };

    try {
      const { _model: metaModel, _inputFileSize: _ifs, _operationType: _opType, _inputVideoUrl: _ivUrl, _meshVideoUrl: _mvUrl, _characterImageUrl: _ciUrl, _sourceVideoUrl: _svUrl, _audioUrl: _auUrl, _imageUrl: _imUrl, _startFrameUrl: _sfUrl, _lastFrameUrl: _lfUrl, _conditioningFrameUrls: _cfUrls, ...apiPayload } = payload;
      void _ifs; void _opType; void _ivUrl; void _mvUrl; void _ciUrl; void _svUrl; void _auUrl; void _imUrl; void _sfUrl; void _lfUrl; void _cfUrls;
      const experimentModel = experiments.modelName as string | undefined;
      const modelUsed = experimentModel === MODELS.UPSCALE
        ? config.upscaleModel
        : metaModel || experimentModel || config.videoGenModel;
      const endpoint = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${modelUsed}${isLongRunning ? ':predictLongRunning' : ':predict'}`;

      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, payload: apiPayload })
      });

      const data = await response.json();

      const explicitType = payload._operationType;
      const operationType = explicitType || params.task || (metaModel === "veo-experimental" ? "transform" : "generation");

      if (isLongRunning && data.name) {
        await addDoc(collection(db, COLLECTIONS.OPERATIONS), {
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
        await addDoc(collection(db, COLLECTIONS.OPERATIONS), {
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
    } catch (error: unknown) {
      addLog({
        type: "ERROR",
        message: "Generation Failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const updateOperationStatus = async (id: string, status: "DONE" | "ERROR", result?: unknown, error?: unknown) => {
    await updateDoc(doc(db, COLLECTIONS.OPERATIONS, id), {
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
