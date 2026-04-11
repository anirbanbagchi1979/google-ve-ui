"use client";

import React from "react";
import {
  Sparkles,
  Clapperboard,
  Drama,
  ListChecks,
  Settings,
  ShieldCheck,
} from "lucide-react";

interface SidebarProps {
  activeView: string;
  onSelect: (view: string) => void;
}

const Sidebar = ({ activeView, onSelect }: SidebarProps) => {
  const items = [
    { id: "upscale",    icon: <Sparkles size={20} />,     label: "4K Upscale" },
    { id: "transform",  icon: <Clapperboard size={20} />, label: "Transform" },
    { id: "perf",       icon: <Drama size={20} />,        label: "Performance" },
    { id: "tasks",      icon: <ListChecks size={20} />,   label: "Tasks" },
  ];

  const bottomItems = [
    { id: "settings", icon: <Settings size={20} />,   label: "Settings" },
    { id: "admin",    icon: <ShieldCheck size={20} />, label: "Admin" },
  ];

  return (
    <div className="w-16 flex flex-col items-center py-6 bg-white border-r border-slate-200 h-full shrink-0 shadow-sm z-50 overflow-hidden">
      <div className="flex-1 flex flex-col gap-2 items-center">
        {items.map((item) => (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onSelect(item.id)}
            className={`flex flex-col items-center transition-all group ${
              activeView === item.id ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <div className={`p-2.5 rounded-xl transition-all duration-200 ${
              activeView === item.id
                ? "bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100"
                : "bg-transparent group-hover:bg-slate-50"
            }`}>
              {item.icon}
            </div>
          </button>
        ))}
      </div>

      <div className="w-8 border-t border-slate-200 my-3 shrink-0" />

      <div className="flex flex-col gap-2 items-center pb-4">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onSelect(item.id)}
            className={`flex flex-col items-center transition-all group ${
              activeView === item.id ? "text-slate-800" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <div className={`p-2.5 rounded-xl transition-all duration-200 ${
              activeView === item.id
                ? "bg-slate-100 text-slate-800 shadow-sm ring-1 ring-slate-200"
                : "bg-transparent group-hover:bg-slate-50"
            }`}>
              {item.icon}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
