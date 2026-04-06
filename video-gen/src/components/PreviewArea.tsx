"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCcw,
  Eye,
  EyeOff,
  Loader2
} from "lucide-react";

interface PreviewAreaProps {
  videoUrl?: string | null;
  originalVideoUrl?: string | null;
  leftLabel?: string;
  rightLabel?: string;
}

const PreviewArea = ({ videoUrl, originalVideoUrl, leftLabel = "Input Video", rightLabel = "Output" }: PreviewAreaProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const origVideoRef = useRef<HTMLVideoElement>(null);

  // Zoom & Pan State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartInfo = useRef({ x: 0, y: 0, startPosX: 0, startPosY: 0 });
  const [showOriginal, setShowOriginal] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const formatTime = (time: number) => {
    const m = Math.floor(time / 60).toString().padStart(2, '0');
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const currentFrame = Math.floor(currentTime * 24);
  const totalFrames = Math.floor(duration * 24);

  const togglePlay = () => {
    if (isPlaying) {
      if (videoRef.current) videoRef.current.pause();
      if (origVideoRef.current) origVideoRef.current.pause();
    } else {
      if (videoRef.current) videoRef.current.play();
      if (origVideoRef.current) origVideoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Reset loading state when video URL changes
  useEffect(() => {
    if (videoUrl) {
      setIsLoading(true);
      setIsPlaying(false);
    }
  }, [videoUrl]);

  // Sync videos if side-by-side
  useEffect(() => {
    if (videoRef.current && origVideoRef.current) {
      origVideoRef.current.currentTime = videoRef.current.currentTime;
    }
  }, [isPlaying]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale(prev => {
      const newScale = Math.max(1, Math.min(8, prev - e.deltaY * 0.01));
      if (newScale === 1) setPosition({ x: 0, y: 0 });
      return newScale;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStartInfo.current = {
        x: e.clientX,
        y: e.clientY,
        startPosX: position.x,
        startPosY: position.y
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - dragStartInfo.current.x;
      const dy = e.clientY - dragStartInfo.current.y;
      setPosition({
        x: dragStartInfo.current.startPosX + dx / scale,
        y: dragStartInfo.current.startPosY + dy / scale
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  if (!videoUrl) {
    return (
      <div className="flex-1 bg-white h-screen overflow-hidden flex items-center justify-center">
        {/* Intentionally blank state */}
      </div>
    );
  }

  const isSplit = !!(videoUrl && originalVideoUrl && showOriginal);

  const zoomStyle = {
    transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
    transformOrigin: "center center",
    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-100 h-screen overflow-hidden p-8">
      <div className="flex-1 relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
        
        {/* Persistent Title Headers */}
        {isSplit && (
          <div className="absolute top-8 left-0 right-0 flex items-center justify-between px-12 pointer-events-none z-30">
            <div className="flex-1 text-center">
              <span className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-lg text-white/50 font-bold uppercase tracking-widest text-sm border border-white/10 drop-shadow-md">{leftLabel}</span>
            </div>
            <div className="flex-1 text-center">
              <span className="px-4 py-2 bg-blue-500/20 backdrop-blur-md rounded-lg text-blue-400 font-bold uppercase tracking-widest text-sm border border-blue-500/30 drop-shadow-md">{rightLabel}</span>
            </div>
          </div>
        )}

        {/* Interactive Surface for zooming & panning */}
        <div 
          className={`w-full h-full absolute inset-0 z-10 ${scale > 1 ? 'cursor-grab' : ''} ${isDragging ? '!cursor-grabbing' : ''}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />

        {/* Video Player(s) Container */}
        <div className={isSplit ? "w-full h-full flex divide-x divide-slate-800" : "w-full h-full"}>
          
          {isSplit && (
            <div className="flex-1 h-full relative overflow-hidden pointer-events-none">
              <video
                ref={origVideoRef}
                src={originalVideoUrl!}
                className="w-full h-full object-contain"
                style={zoomStyle}
                loop
                muted={isMuted}
                playsInline
                preload="auto"
              />
            </div>
          )}

          <div className={isSplit ? "flex-1 h-full relative overflow-hidden pointer-events-none" : "w-full h-full relative pointer-events-none"}>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              style={zoomStyle}
              loop
              muted={isMuted}
              playsInline
              preload="auto"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onCanPlay={(e) => {
                setIsLoading(false);
                e.currentTarget.play();
                setIsPlaying(true);
                if (origVideoRef.current) origVideoRef.current.play();
              }}
            />
          </div>

        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm gap-3">
            <Loader2 size={36} className="text-white animate-spin" />
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Buffering…</p>
          </div>
        )}

        {/* Time and Frame Overlay */}
        <div className="absolute bottom-6 left-8 px-4 py-2 bg-black/60 backdrop-blur-xl rounded-lg border border-white/10 flex items-center gap-4 z-30 pointer-events-none text-white font-mono text-xs drop-shadow-2xl font-medium tracking-tight">
          <span className="text-white/90">{formatTime(currentTime)} <span className="text-white/40">/ {formatTime(duration)}</span></span>
          <span className="text-white/20">|</span>
          <span className="text-white/90">F {currentFrame} <span className="text-white/40">/ {totalFrames}</span></span>
        </div>
        
        {/* Minimal Overlay Controls - visible on hover or when zoomed */}
        <div className="absolute inset-0 p-8 flex flex-col justify-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <div className="flex items-center justify-center gap-6 pointer-events-auto">
            {!!(videoUrl && originalVideoUrl) && (
              <button 
                onClick={(e) => { e.stopPropagation(); setShowOriginal(!showOriginal); }}
                className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all border border-white/10 shadow-lg"
                title={showOriginal ? "Hide Original" : "Show Original"}
              >
                {showOriginal ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            )}

            {scale > 1 && (
              <button 
                onClick={resetZoom}
                className="p-3 bg-blue-500/80 backdrop-blur-md rounded-full text-white hover:bg-blue-600 transition-all border border-blue-400 shadow-lg animate-fade-in"
                title="Reset Zoom"
              >
                <RefreshCcw size={20} />
              </button>
            )}

            <button 
              onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
              className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all border border-white/10 shadow-lg"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="p-5 bg-white text-slate-900 rounded-full hover:bg-slate-100 transition-all shadow-xl active:scale-95 flex items-center justify-center"
            >
              {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
            </button>
          </div>
        </div>

        {/* Zoom Instructions */}
        {scale === 1 && (
          <div className="absolute top-6 right-6 px-3 py-1.5 bg-black/50 backdrop-blur-md rounded border border-white/10 text-[10px] text-white/50 uppercase tracking-widest font-bold pointer-events-none">
            Scroll to Zoom & Pan
          </div>
        )}

      </div>
    </div>
  );
};

export default PreviewArea;
