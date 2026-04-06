"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import ProjectBar from "@/components/ProjectBar";
import ControlPanel from "@/components/ControlPanel";
import PreviewArea from "@/components/PreviewArea";
import DebugConsole from "@/components/DebugConsole";
import OperationsPanel from "@/components/OperationsPanel";
import SettingsPanel from "@/components/SettingsPanel";
import UpscalePanel from "@/components/UpscalePanel";
import TransformPanel from "@/components/TransformPanel";
import AdminPanel from "@/components/AdminPanel";
import { Settings, ShieldCheck } from "lucide-react";
import { logout } from "@/lib/auth";
import { ConfigProvider } from "@/context/ConfigContext";
import { useAuth } from "@/context/AuthContext";
import { ProjectProvider, useProject } from "@/context/ProjectContext";
import LoginPage from "@/components/LoginPage";
import { useGenerationFlow } from "@/hooks/useGenerationFlow";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

const ADMIN_EMAILS = ["anirban.bagchi@gmail.com", "bagchi@google.com"];

const AppContent = () => {
  const { user } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");
  const [activeView, setActiveView] = useState("tasks");
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [previewOriginalVideoUrl, setPreviewOriginalVideoUrl] = useState<string | null>(null);
  const [previewLeftLabel, setPreviewLeftLabel] = useState("Input Video");
  const [previewRightLabel, setPreviewRightLabel] = useState("Output");
  
  const { currentProjectId } = useProject();
  const { operations, logs, setLogs, addLog, handleGenerate, updateOperationStatus } = useGenerationFlow(setActiveView);

  // Clear preview when switching views or projects
  useEffect(() => {
    setPreviewVideoUrl(null);
    setPreviewOriginalVideoUrl(null);
  }, [activeView, currentProjectId]);

  return (
    <div className="flex flex-col h-screen overflow-hidden font-sans tracking-tight">
    <Navbar onAdminClick={() => setActiveView("admin")} />
    <ProjectBar />
    <main className="flex flex-1 bg-slate-100 overflow-hidden text-slate-900">
      <Sidebar activeView={activeView} onSelect={setActiveView} />

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panels */}
          <div className="w-[460px] border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden shadow-2xl z-10 transition-all duration-500">
            {activeView === "inputs" ? (
              <ControlPanel onGenerate={handleGenerate} />
            ) : activeView === "upscale" ? (
              <UpscalePanel onGenerate={handleGenerate} onVideoSelect={(url, orig) => { setPreviewVideoUrl(url); setPreviewOriginalVideoUrl(orig || null); }} />
            ) : activeView === "transform" ? (
              <TransformPanel onGenerate={handleGenerate} onVideoSelect={(url) => { setPreviewVideoUrl(url); setPreviewOriginalVideoUrl(null); }} />
            ) : activeView === "perf" ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-4">
                <div className="w-14 h-14 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center">
                  <span className="text-2xl">🚧</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-700">Performance Control</p>
                  <p className="text-xs text-slate-400 mt-1">Not implemented at this time</p>
                </div>
              </div>
            ) : activeView === "tasks" ? (
              <OperationsPanel
                operations={operations}
                addLog={addLog}
                onVideoSelect={(url, orig, left, right) => {
                  setPreviewVideoUrl(url);
                  setPreviewOriginalVideoUrl(orig || null);
                  setPreviewLeftLabel(left || "Input Video");
                  setPreviewRightLabel(right || "Output");
                }}
                onStatusUpdate={updateOperationStatus}
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
            ) : activeView === "admin" ? (
              isAdmin ? <AdminPanel /> : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <ShieldCheck size={32} className="text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">Admin Access Only</p>
                  <p className="text-xs text-slate-400">You don&apos;t have permission to access this area.</p>
                </div>
              )
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
               <PreviewArea videoUrl={previewVideoUrl} originalVideoUrl={previewOriginalVideoUrl} leftLabel={previewLeftLabel} rightLabel={previewRightLabel} />
             )}
             <DebugConsole logs={logs} onClear={() => setLogs([])} />
          </div>
        </div>
      </div>
    </main>
    </div>
  );
};

const AuthGate = () => {
  const { user, loading, setToken } = useAuth();
  const [allowlistChecked, setAllowlistChecked] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Admins are always allowed without a Firestore round-trip
    if (ADMIN_EMAILS.includes(user.email ?? "")) {
      setIsAllowed(true);
      setAllowlistChecked(true);
      return;
    }
    // Everyone else: check Firestore allowlist
    getDocs(query(collection(db, "allowlist"), where("email", "==", user.email ?? "")))
      .then(snap => { setIsAllowed(!snap.empty); setAllowlistChecked(true); })
      .catch(() => { setIsAllowed(false); setAllowlistChecked(true); });
  }, [user]);

  if (loading || (user && !allowlistChecked)) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return <LoginPage />;

  if (!isAllowed) {
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
    <ProjectProvider>
      <ConfigProvider>
        <AppContent />
      </ConfigProvider>
    </ProjectProvider>
  );
};

export default function Home() {
  return <AuthGate />;
}
