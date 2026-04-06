"use client";
import React from "react";
import { PlayCircle } from "lucide-react";
import { formatBytes } from "@/utils/time";

interface VideoThumbnailCardProps {
  vid: { id: string; url: string; size?: number; aspectRatio?: string };
  isSelected?: boolean;
  onClick: () => void;
}

export function VideoThumbnailCard({ vid, isSelected, onClick }: VideoThumbnailCardProps) {
  return (
    <div
      onClick={onClick}
      className={`relative aspect-video bg-black rounded-lg overflow-hidden border-2 cursor-pointer transition-all group active:scale-95
        ${isSelected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"}`}
    >
      <video
        src={vid.url + "#t=0.5"}
        className="w-full h-full object-contain"
        preload="metadata"
        muted
        playsInline
        onMouseEnter={e => e.currentTarget.play()}
        onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0.5; }}
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <PlayCircle size={20} className="text-white" />
      </div>
      {vid.size && (
        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded pointer-events-none">
          {formatBytes(vid.size)}
        </div>
      )}
      {vid.aspectRatio && (
        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded pointer-events-none">
          {vid.aspectRatio}
        </div>
      )}
      {isSelected && (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded pointer-events-none">✓</div>
      )}
    </div>
  );
}
