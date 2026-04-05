"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import { signInWithGoogle } from "@/lib/auth";

const Hero = () => {
  const { user, loading } = useAuth();

  return (
    <div className="relative flex flex-col items-center justify-center min-vh-100 text-center px-4 pt-32 pb-20">
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-primary/20 rounded-full blur-[120px] -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-secondary/20 rounded-full blur-[120px] -z-10 animate-pulse delay-1000" />
      
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight">
          Hello <span className="text-gradient">World</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-slate-400 font-light max-w-2xl mx-auto leading-relaxed">
          Welcome to Google Video Generation. Experience the future of web applications with seamless Google Authentication.
        </p>

        <div className="pt-8">
          {!loading && (
            user ? (
              <div className="glass p-8 rounded-3xl animate-float max-w-md mx-auto">
                <div className="flex flex-col items-center gap-4">
                  {user.photoURL && (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || "User"} 
                      className="w-20 h-20 rounded-full border-2 border-brand-primary p-1 shadow-xl shadow-brand-primary/20"
                    />
                  )}
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold">Welcome back, {user.displayName}!</h2>
                    <p className="text-slate-500 font-mono text-sm">{user.email}</p>
                  </div>
                  <div className="w-full h-px bg-white/10 my-2" />
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Authenticated via Firebase</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={signInWithGoogle}
                  className="bg-white text-slate-900 px-10 py-5 rounded-full text-lg font-bold hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-500/20"
                >
                  Get Started for Free
                </button>
                <button className="glass px-10 py-5 rounded-full text-lg font-semibold hover:bg-white/5 transition-all">
                  Learn More
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Hero;
