"use client";

import React, { useRef, useState } from "react";
import { 
  ChevronDown, 
  HelpCircle, 
  ArrowUpRight,
  Maximize2,
  Play,
  Pause,
  Share2,
  Download,
  Volume2,
  VolumeX
} from "lucide-react";

interface PreviewAreaProps {
  videoUrl?: string | null;
}

const PreviewArea = ({ videoUrl }: PreviewAreaProps) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const tags = [
  ];

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white h-screen overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-50 px-2 py-1 rounded-md transition-colors">
          {videoUrl ? "Selected Asset" : "Untitled session"} <ChevronDown size={14} />
        </div>
        
        <div className="flex items-center gap-4">
          {/* Credits and Upgrade removed */}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <h1 className="text-4xl font-bold text-center tracking-tight text-slate-900 leading-tight">
            {videoUrl ? "Reviewing your generated content" : "Everything you need to make anything you want"}
          </h1>
          
          <div className="flex flex-wrap justify-center gap-2">
            {tags.map((tag, i) => (
              <button 
                key={i}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  tag.active 
                  ? "bg-slate-100 text-slate-900 border border-slate-200" 
                  : "text-slate-400 hover:text-slate-600 border border-transparent"
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>

          {/* Video Preview Container */}
          <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl group border border-slate-800">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted={isMuted}
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-900">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
                  <Play size={28} className="text-slate-600" />
                </div>
                <p className="text-slate-600 text-sm font-medium">No video selected</p>
              </div>
            )}
            
            {/* Overlay Elements */}
            <div className="absolute inset-0 p-8 flex flex-col justify-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex items-end justify-between w-full">
                <div className="space-y-4 max-w-xl">
                  <div className="flex flex-col gap-1">
                    <span className="text-yellow-500 font-bold text-sm tracking-widest uppercase">
                      {videoUrl ? "Live Playback" : "Character Prompt"}
                    </span>
                    <p className="text-white text-xl font-medium leading-relaxed drop-shadow-lg">
                      {videoUrl ? "Previewing selected library asset" : "The man sips the OAHU water and daydreams he's jet-skiing on a giant version of the bottle."}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all border border-white/10"
                  >
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                  <button className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all border border-white/10">
                    <Maximize2 size={20} />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="p-4 bg-white text-slate-900 rounded-full hover:bg-slate-100 transition-all shadow-xl active:scale-95 flex items-center justify-center"
                  >
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Controls Bar (Pro Style) */}
            <div className="absolute top-6 right-6 flex gap-2 translate-y-[-20px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
               <button className="p-2.5 bg-white/10 backdrop-blur-md rounded-lg text-white hover:bg-white/20 shadow-lg border border-white/10">
                 <Share2 size={18} />
               </button>
               <button className="p-2.5 bg-white/10 backdrop-blur-md rounded-lg text-white hover:bg-white/20 shadow-lg border border-white/10">
                 <Download size={18} />
               </button>
            </div>
          </div>

          {/* Large Upgrade button removed */}
        </div>
      </div>
    </div>
  );
};

export default PreviewArea;
