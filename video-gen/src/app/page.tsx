"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import ControlPanel from "@/components/ControlPanel";
import PreviewArea from "@/components/PreviewArea";
import DebugConsole from "@/components/DebugConsole";
import OperationsPanel from "@/components/OperationsPanel";
import SettingsPanel from "@/components/SettingsPanel";
import UpscalePanel from "@/components/UpscalePanel";
import { Settings } from "lucide-react";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp,
  doc,
  updateDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logout } from "@/lib/auth";
import { ConfigProvider, useConfig } from "@/context/ConfigContext";
import { useAuth } from "@/context/AuthContext";
import LoginPage from "@/components/LoginPage";

const AppContent = () => {
  const [activeView, setActiveView] = useState("inputs");
  const [operations, setOperations] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const { config } = useConfig();
  const { user } = useAuth();

  // 1. Initial Load
  useEffect(() => {
    const q = query(collection(db, "operations"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ops = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOperations(ops);
    });

    return () => unsubscribe();
  }, []);

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
                error: data.error
              });
              addLog({ type: "ERROR", message: `Operation Failed: ${op.id}`, operationId: op.name, details: data.error });
            } else {
              await updateDoc(doc(db, "operations", op.id), {
                status: "DONE",
                updatedAt: Timestamp.now(),
                result: data.response
              });
              addLog({ type: "FLOW", message: `Operation Complete: ${op.id}`, operationId: op.name });
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [operations]);

  const addLog = (log: any) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      ...log
    }, ...prev].slice(0, 50));
  };

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

      if (isLongRunning && data.name) {
        await addDoc(collection(db, "operations"), {
          name: data.name,
          status: "RUNNING",
          type: payload.parameters?.task || "generation",
          userEmail: user?.email,
          createdAt: Timestamp.now(),
          payload: payload
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

  return (
    <div className="flex flex-col h-screen overflow-hidden font-sans tracking-tight">
    <Navbar />
    <main className="flex flex-1 bg-slate-100 overflow-hidden text-slate-900">
      <Sidebar activeView={activeView} onSelect={setActiveView} />

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panels */}
          <div className="w-[460px] border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden shadow-2xl z-10 transition-all duration-500">
            {activeView === "inputs" ? (
              <ControlPanel onGenerate={handleGenerate} />
            ) : activeView === "upscale" ? (
              <UpscalePanel onGenerate={handleGenerate} onVideoSelect={(url) => setPreviewVideoUrl(url)} />
            ) : activeView === "tasks" ? (
              <OperationsPanel
                operations={operations}
                addLog={addLog}
                onVideoSelect={(url) => setPreviewVideoUrl(url)}
                onStatusUpdate={async (id, status, result, error) => {
                  await updateDoc(doc(db, "operations", id), {
                    status,
                    updatedAt: Timestamp.now(),
                    ...(result ? { result } : {}),
                    ...(error ? { error } : {})
                  });
                }}
              />
            ) : activeView === "settings" ? (
              <div className="flex-1 flex items-center justify-center bg-slate-50 p-12 text-center">
                 <div className="space-y-4 max-w-[300px]">
                   <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <Settings size={32} />
                   </div>
                   <h3 className="text-xl font-bold text-slate-800">Configuration Mode</h3>
                   <p className="text-sm text-slate-400 font-medium">Use the center panel to modify project environment variables, regions, and GCS buckets.</p>
                 </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 font-medium uppercase tracking-widest text-[10px]">
                View Under Development
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
             {activeView === "settings" ? (
               <SettingsPanel />
             ) : (
               <PreviewArea videoUrl={previewVideoUrl} />
             )}
             <DebugConsole logs={logs} onClear={() => setLogs([])} />
          </div>
        </div>
      </div>
    </main>
    </div>
  );
};

const ALLOWED_EMAILS = ["anirban.bagchi@gmail.com", "bagchi@google.com"];

const AuthGate = () => {
  const { user, loading, setToken } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return <LoginPage />;

  if (!ALLOWED_EMAILS.includes(user.email ?? "")) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-4">
        <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center">
          <span className="text-2xl">🚫</span>
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-white font-bold text-xl">Access Denied</h1>
          <p className="text-slate-400 text-sm">
            <span className="text-slate-300 font-medium">{user.email}</span> is not authorised to use this app.
          </p>
        </div>
        <button
          onClick={async () => { await logout(); setToken(null); }}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg border border-slate-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  );
};

export default function Home() {
  return <AuthGate />;
}
