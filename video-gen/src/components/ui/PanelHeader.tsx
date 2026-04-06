import React from "react";

interface PanelHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function PanelHeader({ icon, title, subtitle, actions }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
      <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center shrink-0 text-white">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-blue-900">{title}</p>
        <p className="text-[10px] text-blue-600/60">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}
