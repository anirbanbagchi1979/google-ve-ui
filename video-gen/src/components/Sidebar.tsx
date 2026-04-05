"use client";

import React from "react";
import {
  History,
  User,
  Settings,
  Maximize2,
  Wand2,
  Drama,
} from "lucide-react";

interface SidebarProps {
  activeView: string;
  onSelect: (view: string) => void;
}

const Sidebar = ({ activeView, onSelect }: SidebarProps) => {
  const items = [
    { id: "upscale", icon: <Maximize2 size={20} />, label: "4K" },
    { id: "transform", icon: <Wand2 size={20} />, label: "Transform" },
    { id: "perf", icon: <Drama size={20} />, label: "Performance" },
    { id: "tasks", icon: <History size={20} />, label: "Tasks" },
    { id: "settings", icon: <Settings size={20} />, label: "Settings" },
  ];

  return (
    <div className="w-16 flex flex-col items-center py-6 bg-white border-r border-slate-200 h-screen shrink-0 shadow-sm z-50">
      <div className="flex-1 flex flex-col gap-8 items-center">
        {items.map((item) => (
          <button 
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`flex flex-col items-center gap-1.5 transition-all group ${
              activeView === item.id ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <div className={`p-2.5 rounded-xl transition-all duration-300 ${
              activeView === item.id 
              ? "bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100" 
              : "bg-transparent group-hover:bg-slate-50"
            }`}>
              {item.icon}
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${
              activeView === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
      
      <button className="text-slate-400 hover:text-slate-900 mt-auto p-2">
        <User size={24} />
      </button>
    </div>
  );
};

export default Sidebar;
