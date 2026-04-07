"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { signInWithGoogle, logout } from "@/lib/auth";
import { LogOut, User, ChevronDown, ShieldCheck, Check, Plus, FolderOpen } from "lucide-react";
import AppIcon from "@/components/AppIcon";
import { ADMIN_EMAILS } from "@/constants/admin";

interface NavbarProps {
  onAdminClick?: () => void;
}

const Navbar = ({ onAdminClick }: NavbarProps) => {
  const { user, loading } = useAuth();
  const { projects, currentProjectId, switchProject, createProject } = useProject();
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const userDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node))
        setUserDropdownOpen(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node))
        setProjectDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = async () => {
    setUserDropdownOpen(false);
    try {
      await logout();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setNewProjectName("");
    setProjectDropdownOpen(false);
  };

  const currentProject = projects.find(p => p.id === currentProjectId);

  return (
    <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-50 gap-4">
      {/* Left — branding */}
      <div className="flex items-center gap-2 shrink-0">
        <AppIcon size={22} />
        <span className="text-[13px] font-semibold text-slate-800 tracking-tight hidden sm:block">
          Vertex Experimental Flow
        </span>
        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-500 text-[9px] font-bold uppercase tracking-widest rounded border border-blue-100 hidden sm:block">
          Beta
        </span>
      </div>

      {/* Center — project selector (only when logged in) */}
      {!loading && user && (
        <div className="relative" ref={projectDropdownRef}>
          <button
            onClick={() => setProjectDropdownOpen(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all"
          >
            <FolderOpen size={13} className="text-blue-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700 max-w-[160px] truncate">
              {currentProject?.name ?? "Select Project"}
            </span>
            <ChevronDown size={12} className={`text-slate-400 transition-transform shrink-0 ${projectDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {projectDropdownOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
              <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                {projects.length === 0 && (
                  <p className="text-[11px] text-slate-400 text-center py-3">No projects yet</p>
                )}
                {projects.map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => { switchProject(proj.id); setProjectDropdownOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[12px] rounded-lg transition-colors ${
                      currentProjectId === proj.id
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate pr-3">{proj.name}</span>
                    {currentProjectId === proj.id && <Check size={13} className="shrink-0 text-blue-500" />}
                  </button>
                ))}
              </div>
              <div className="p-2 border-t border-slate-100 bg-slate-50">
                <form onSubmit={handleCreateProject} className="flex gap-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    placeholder="New project…"
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!newProjectName.trim()}
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right — user */}
      {!loading && (
        <div className="relative shrink-0" ref={userDropdownRef}>
          {user ? (
            <>
              <button
                onClick={() => setUserDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <User size={13} className="text-white" />
                  </div>
                )}
                <span className="text-[12px] text-slate-600 hidden sm:block max-w-[140px] truncate">
                  {user.displayName || user.email}
                </span>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${userDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-[12px] font-semibold text-slate-800 truncate">{user.displayName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                  </div>
                  {isAdmin && onAdminClick && (
                    <button
                      onClick={() => { setUserDropdownOpen(false); onAdminClick(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <ShieldCheck size={14} className="text-slate-400" />
                      Admin
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <LogOut size={14} className="text-slate-400" />
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
