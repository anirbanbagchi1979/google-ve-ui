"use client";

import React, { useState } from "react";
import { Video, Cpu, Maximize2, ArrowRight, Loader2 } from "lucide-react";
import AppIcon from "@/components/AppIcon";
import { signInWithGoogle } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";

const LoginPage = () => {
  const { setToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (result.credential) setToken(result.credential.accessToken || null);
    } catch (err: any) {
      setError("Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="h-11 border-b border-slate-800 flex items-center px-6">
        <div className="flex items-center gap-2">
          <AppIcon size={24} />
          <span className="text-[13px] font-semibold text-white tracking-tight">Vertex Experimental Flow</span>
          <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] font-bold uppercase tracking-widest rounded">Beta</span>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">
          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="mb-2">
              <AppIcon size={64} />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Vertex Experimental Flow
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
              Generate, upscale, and manage AI videos with Google's Veo models — powered by Vertex AI.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { icon: Video, label: "Veo Video Generation" },
              { icon: Cpu, label: "Vertex AI" },
              { icon: Maximize2, label: "4K Upscaling" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-full text-[11px] text-slate-400 font-medium">
                <Icon size={11} className="text-blue-400" />
                {label}
              </div>
            ))}
          </div>

          {/* Sign-in card */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-white font-semibold text-base">Sign in to continue</h2>
              <p className="text-slate-500 text-xs">Use your Google account with GCP access.</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-red-400 text-xs">
                {error}
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-slate-900 rounded-xl font-semibold text-sm hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  {/* Google G logo */}
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Sign in with Google
                  <ArrowRight size={16} className="ml-auto" />
                </>
              )}
            </button>

            <p className="text-[10px] text-slate-600 text-center leading-relaxed">
              Your Google account must have access to the configured GCP project and Vertex AI APIs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
