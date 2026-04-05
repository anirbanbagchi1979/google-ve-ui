"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { signInWithGoogle, logout } from "@/lib/auth";
import { LogOut, User, ChevronDown, Zap } from "lucide-react";

const Navbar = () => {
  const { user, loading, setToken } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogin = async () => {
    try {
      const result = await signInWithGoogle();
      if (result.credential) setToken(result.credential.accessToken || null);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = async () => {
    setDropdownOpen(false);
    try {
      await logout();
      setToken(null);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 shrink-0 z-50">
      {/* Left — branding */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
          <Zap size={13} className="text-white" fill="currentColor" />
        </div>
        <span className="text-[13px] font-semibold text-white tracking-tight">
          Vertex Experimental Flow
        </span>
        <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] font-bold uppercase tracking-widest rounded">
          Beta
        </span>
      </div>
      {/* Right — user */}
      {!loading && (
        <div className="relative" ref={dropdownRef}>
          {user ? (
            <>
              <button
                onClick={() => setDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <User size={13} className="text-white" />
                  </div>
                )}
                <span className="text-[12px] text-slate-300 hidden sm:block max-w-[140px] truncate">
                  {user.displayName || user.email}
                </span>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-[12px] font-semibold text-white truncate">{user.displayName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-[12px] font-semibold rounded-lg hover:bg-blue-700 transition-colors active:scale-95"
            >
              Sign in with Google
            </button>
          )}
        </div>
      )}
    </header>
  );
};

export default Navbar;
