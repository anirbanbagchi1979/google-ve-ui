import { useState, useEffect } from "react";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp,
  doc,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useConfig } from "@/context/ConfigContext";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";

export function useGenerationFlow(setActiveView: (view: string) => void) {
  const [operations, setOperations] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const { config } = useConfig();
  const { user } = useAuth();
  const { currentProjectId } = useProject();

  const addLog = (log: any) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      ...log
    }, ...prev].slice(0, 50));
  };

  // 1. Initial Load Operations
  useEffect(() => {
    if (!currentProjectId) {
      setOperations([]);
      return;
    }
    const q = query(
      collection(db, "operations"), 
      where("projectId", "==", currentProjectId),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ops = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOperations(ops);
    });

    return () => unsubscribe();
  }, [currentProjectId]);

  // 2. Background Polling Service for Incomplete Tasks
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const runningOps = operations.filter(op => op.status === "RUNNING");
      
      for (const op of runningOps) {
        try {
          const modelName = op.type === "upscale" ? config.upscaleModel : config.videoGenModel;
          const endpoint = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${modelName}:fetchPredictOperation`;

          const response = await fetch("/api/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint, payload: { operationName: op.name } })
          });
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

    try {
      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/publishers/google/models/${payload.parameters?.experiments?.modelName === 'veo3p1_upscale' ? config.upscaleModel : config.videoGenModel}${isLongRunning ? ':predictLongRunning' : ':predict'}`,
          payload: payload
        })
      });

      const data = await response.json();
      const modelUsed = payload.parameters?.experiments?.modelName === 'veo3p1_upscale' ? config.upscaleModel : config.videoGenModel;
      
      if (isLongRunning && data.name) {
        await addDoc(collection(db, "operations"), {
          name: data.name,
          status: "RUNNING",
          type: payload.parameters?.task || "generation",
          userEmail: user?.email,
          projectId: currentProjectId,
          createdAt: Timestamp.now(),
          payload: payload,
          originalGcsUri: payload?.instances?.[0]?.video?.gcsUri || null,
          modelUsed: modelUsed
        });
        
        setActiveView("tasks");
        
        addLog({
          type: "FLOW",
          message: "LRO Task Queued to Firestore",
          operationId: data.name
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
    logs,
    setLogs,
    addLog,
    handleGenerate,
    updateOperationStatus
  };
}
