"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { ChevronDown, Folder, Plus, Check } from "lucide-react";

const ProjectBar = () => {
  const { user, loading } = useAuth();
  const { projects, currentProjectId, switchProject, createProject } = useProject();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setNewProjectName("");
    setProjectDropdownOpen(false);
  };

  if (loading || !user) return null;

  return (
    <div className="h-11 bg-slate-800 border-b border-slate-700 flex items-center px-4 shrink-0 z-40 relative">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mr-2">Current Project:</span>
        <div className="relative" ref={projectDropdownRef}>
          <button
            onClick={() => setProjectDropdownOpen(prev => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-600"
          >
            <Folder size={14} className="text-blue-400" />
            <span className="text-[12px] font-medium text-slate-200">
              {projects.find(p => p.id === currentProjectId)?.name || "Select Project"}
            </span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${projectDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          
          {projectDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
               <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                 {projects.length === 0 && (
                   <p className="text-[11px] text-slate-400 text-center py-2">No projects yet</p>
                 )}
                 {projects.map(proj => (
                   <button
                     key={proj.id}
                     onClick={() => { switchProject(proj.id); setProjectDropdownOpen(false); }}
                     className={`w-full flex items-center justify-between px-3 py-2 text-[12px] rounded-lg transition-colors ${
                       currentProjectId === proj.id ? "bg-blue-500/10 text-blue-400" : "text-slate-300 hover:bg-slate-700"
                     }`}
                   >
                     <span className="truncate pr-4">{proj.name}</span>
                     {currentProjectId === proj.id && <Check size={14} />}
                   </button>
                 ))}
               </div>
               <div className="p-2 border-t border-slate-700 bg-slate-900/50">
                  <form onSubmit={handleCreateProject} className="flex gap-2">
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      placeholder="New project name..."
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <button 
                      type="submit" 
                      disabled={!newProjectName.trim()}
                      className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </form>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectBar;
