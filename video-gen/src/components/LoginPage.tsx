"use client";

import React, { useState } from "react";
import { Video, Cpu, Maximize2, ArrowRight, Loader2 } from "lucide-react";
import AppIcon from "@/components/AppIcon";
import { signInWithGoogle } from "@/lib/auth";

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("[LoginPage] sign-in failed:", err);
      setError("Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans tracking-tight">
      {/* Navbar — matches app header exactly */}
      <header className="h-11 bg-white border-b border-slate-200 flex items-center px-5 shrink-0">
        <div className="flex items-center gap-2">
          <AppIcon size={22} />
          <span className="text-[13px] font-bold text-slate-800 tracking-tight">Vertex Experimental Flow</span>
          <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[9px] font-black uppercase tracking-widest rounded-md">Beta</span>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">

          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-1">
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200">
                <AppIcon size={40} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Vertex Experimental Flow
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Generate, upscale, and manage AI&nbsp;videos<br />
              with Google&apos;s Veo models via Vertex AI.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { icon: Video, label: "Veo Video Generation" },
              { icon: Cpu, label: "Vertex AI" },
              { icon: Maximize2, label: "4K Upscaling" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] text-slate-500 font-medium shadow-sm">
                <Icon size={11} className="text-blue-500" />
                {label}
              </div>
            ))}
          </div>

          {/* Sign-in card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm space-y-5">
            <div className="space-y-0.5">
              <h2 className="text-slate-800 font-bold text-[15px]">Sign in to continue</h2>
              <p className="text-slate-400 text-xs">Use your Google account with GCP access.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-600 text-xs font-medium">
                {error}
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 text-slate-800 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin text-slate-400 mx-auto" />
              ) : (
                <>
                  {/* Google G logo */}
                  <svg width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  <span className="flex-1">Sign in with Google</span>
                  <ArrowRight size={15} className="text-slate-400 shrink-0" />
                </>
              )}
            </button>

            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              Your account must have access to the configured<br />GCP project and Vertex AI APIs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
