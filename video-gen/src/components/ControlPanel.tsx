"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Upload,
  Folder,
  Loader2,
  CheckCircle,
  AlertCircle,
  PlayCircle,
} from "lucide-react";
import { storage } from "@/lib/firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { useFileUpload } from "@/hooks/useFileUpload";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { formatBytes } from "@/utils/time";
import { getGcsUri } from "@/utils/gcs";
import { COLLECTIONS, STORAGE_PATHS, DEFAULTS, MODELS, MIME } from "@/constants";
import { generateTimestamp } from "@/utils/time";

interface ControlPanelProps {
  onVideoSelect?: (url: string) => void;
  onGenerate?: (payload: any, isLongRunning?: boolean) => void;
}

const ControlPanel = ({ onVideoSelect, onGenerate }: ControlPanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();
  const [activeTab, setActiveTab] = useState<"Image" | "Video">("Video");
  const [assetFilter, setAssetFilter] = useState<"Image" | "Video">("Video");

  // Asset States
  const [images, setImages] = useState<string[]>([]);
  const { videos, loadingAssets, loadingMore: loadingMoreVideos, hasMore: hasMoreVideos, fetchVideos, loadMoreVideos } = useVideoLibrary(currentProjectId);
  const [assetError, setAssetError] = useState<string | null>(null);

  // Video Upload
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoUpload = useFileUpload({
    storagePath: STORAGE_PATHS.VIDEOS,
    firestoreCollection: COLLECTIONS.VIDEOS,
    accept: "video",
    projectId: currentProjectId,
    extraDocFields: { isUpscaleOutput: false },
    onSuccess: async () => {
      await fetchVideos();
      setAssetFilter("Video");
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    },
  });

  // Selection & Prompt State
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null);
  const [selectedAssetType, setSelectedAssetType] = useState<"image" | "video" | null>(null);
  const [promptText, setPromptText] = useState("");

  const fetchImages = useCallback(async () => {
    try {
      const listRef = ref(storage, "/");
      const res = await listAll(listRef);
      const urls = await Promise.all(
        res.items.map((itemRef) => getDownloadURL(itemRef))
      );
      setImages(urls);
    } catch (err) {
      console.error("Error fetching images", err);
      throw err;
    }
  }, []);

  const loadAllAssets = useCallback(async () => {
    setAssetError(null);
    try {
      await Promise.all([fetchImages(), fetchVideos()]);
    } catch (err) {
      console.error("Asset load error", err);
      setAssetError("Failed to load some assets.");
    }
  }, [fetchImages, fetchVideos]);

  useEffect(() => {
    loadAllAssets();
  }, [loadAllAssets]);

  useEffect(() => {
    if (activeTab === "Image") {
      setAssetFilter("Image");
    }
  }, [activeTab]);

  return (
    <div className="w-[380px] flex flex-col bg-white border-r border-slate-200 h-screen shrink-0 overflow-hidden text-slate-900 border-l border-slate-100">
      {/* Top Tabs */}
      <div className="flex px-4 pt-4 border-b border-slate-100">
        <button 
          onClick={() => setActiveTab("Image")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-all ${
            activeTab === "Image" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <ImageIcon size={16} /> Image
        </button>
        <button 
          onClick={() => setActiveTab("Video")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-all ${
            activeTab === "Video" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <VideoIcon size={16} /> Video
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Upload Section */}
        <div 
          onClick={() => !videoUpload.isUploading && fileInputRef.current?.click()}
          className={`relative group cursor-pointer ${videoUpload.isUploading ? 'cursor-not-allowed' : ''}`}
        >
          <div className="aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3 transition-colors group-hover:bg-slate-100 group-hover:border-slate-300">
            {videoUpload.isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
                <p className="text-xs font-bold text-slate-600">{Math.round(videoUpload.progress)}% Uploading...</p>
              </div>
            ) : uploadSuccess ? (
              <div className="flex flex-col items-center gap-2 animate-bounce">
                <CheckCircle size={32} className="text-green-500" />
                <p className="text-xs font-bold text-green-600">Video Saved!</p>
              </div>
            ) : selectedAssetUrl ? (
              <div className="relative w-full h-full group/selection">
                {selectedAssetType === "video" ? (
                  <video 
                    src={selectedAssetUrl} 
                    className="w-full h-full object-cover rounded-lg"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img 
                    src={selectedAssetUrl} 
                    alt="Selected first frame" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/selection:opacity-100 transition-opacity flex items-center justify-center gap-3">
                   {selectedAssetType === "video" && (
                     <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        
                         const timestamp = generateTimestamp();
                         const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

                         const payload = {
                           instances: [{
                             video: {
                               gcsUri: getGcsUri(selectedAssetUrl),
                               mimeType: MIME.VIDEO_MP4
                             },
                             fps: DEFAULTS.FPS
                           }],
                           parameters: {
                             task: "upscale",
                             compressionQuality: DEFAULTS.COMPRESSION_QUALITY,
                             resolution: DEFAULTS.RESOLUTION,
                             aspectRatio: DEFAULTS.ASPECT_RATIO,
                             storageUri: outputUri,
                             experiments: { "modelName": MODELS.UPSCALE }
                           }
                         };
                         onGenerate?.(payload, true); 
                      }}
                      className="p-2 bg-blue-500 rounded-lg text-white hover:bg-blue-600 transition-all font-bold text-xs shadow-lg flex items-center gap-1.5"
                     >
                       Upscale to 4K
                     </button>
                   )}
                   <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssetUrl(null);
                      setSelectedAssetType(null);
                    }}
                    className="p-2 bg-white/20 backdrop-blur-md rounded-lg text-white hover:bg-white/40 border border-white/20 transition-all font-bold text-xs"
                   >
                     Clear
                   </button>
                   <div className="text-white text-xs font-bold px-3 py-2 bg-blue-500 rounded-lg shadow-lg">
                      {selectedAssetType === "video" ? "Input Video" : "First Frame Selected"}
                   </div>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 bg-white rounded-lg shadow-sm border border-slate-100 text-slate-400 group-hover:text-blue-500 transition-colors">
                  {activeTab === "Video" ? <VideoIcon size={24} /> : <ImageIcon size={24} />}
                </div>
                <div className="text-center px-4">
                  <p className="text-sm font-bold text-slate-600">
                    {activeTab === "Video" ? "Upload Input Video" : "First Video Frame"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Select from computer or cloud</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-50">
                    <Upload size={14} /> Upload
                  </button>
                </div>
              </>
            )}
          </div>
          {videoUpload.error && (
             <div className="mt-2 flex items-center gap-2 text-red-500 text-[10px] font-medium bg-red-50 p-2 rounded-lg">
                <AlertCircle size={14} /> {videoUpload.error}
             </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                await videoUpload.upload(file);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }
            }}
            accept="video/*"
            className="hidden"
          />
        </div>

        {/* Prompt Input */}
        <div className="space-y-2">
          <textarea 
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder={activeTab === "Video" ? "Add motion description or camera directions..." : "Describe your shot, or add a first video frame"}
            className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          ></textarea>
        </div>

        {/* Dynamic Image/Video Reuse Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Recent Assets</SectionLabel>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
               <button 
                onClick={() => activeTab !== "Image" && setAssetFilter("Video")}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                  assetFilter === "Video" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                } ${activeTab === "Image" ? "opacity-50 cursor-not-allowed" : ""}`}
               >
                 Video
               </button>
               <button 
                onClick={() => setAssetFilter("Image")}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                  assetFilter === "Image" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}
               >
                 Image
               </button>
            </div>
          </div>
          
          <div className="flex gap-4 items-start">
            <div className="grid grid-cols-1 gap-2 w-24">
              {loadingAssets ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={18} className="text-slate-300 animate-spin" />
                </div>
              ) : assetError ? (
                <div className="aspect-video bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500 text-[10px] text-center p-1">
                  {assetError}
                </div>
              ) : assetFilter === "Image" ? (
                images.length > 0 ? (
                  images.slice(0, 3).map((url, i) => (
                    <div 
                      key={i} 
                      onClick={() => {
                        setSelectedAssetUrl(url);
                        setSelectedAssetType("image");
                      }}
                      className={`aspect-video rounded-lg overflow-hidden border-2 transition-all group relative cursor-pointer active:scale-95 ${
                        selectedAssetUrl === url ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200"
                      }`}
                    >
                      <img src={url} alt={`asset ${i}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400 text-center py-6">No images</p>
                )
              ) : videos.length > 0 ? (
                videos.slice(0, 3).map((vid) => (
                  <div 
                    key={vid.id} 
                    onClick={() => {
                      onVideoSelect?.(vid.url);
                      setSelectedAssetUrl(vid.url);
                      setSelectedAssetType("video");
                    }}
                    className={`rounded-lg overflow-hidden border-2 transition-all group relative cursor-pointer active:scale-95 flex items-center justify-center ${
                      selectedAssetUrl === vid.url ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200"
                    }`}
                    style={{ aspectRatio: vid.aspectRatio === "9:16" ? "9/16" : "16/9" }}
                  >
                    <video 
                      src={vid.url + "#t=0.1"} 
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0.1;
                      }}
                    />
                    {vid.size && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded pointer-events-none">
                        {formatBytes(vid.size)}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <PlayCircle size={20} className="text-white" />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-slate-400 text-center py-6">No videos</p>
              )}
              {hasMoreVideos && <LoadMoreButton loading={loadingMoreVideos} onClick={loadMoreVideos} />}
            </div>
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-[13px] font-bold text-slate-800">Media Library</p>
                <p className="text-[12px] text-slate-500 leading-snug">
                  {assetFilter === "Video" ? "Click to play a video in the main preview." : "Drag assets here to use as reference."}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="p-2 transition-colors hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-400">
                   <Folder size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
           <button
            onClick={() => {
              const payload = {
                instances: [
                  {
                    prompt: promptText,
                    ...(selectedAssetUrl && selectedAssetType === "image" ? {
                      referenceImages: [
                        {
                          image: {
                            gcsUri: getGcsUri(selectedAssetUrl),
                            mimeType: MIME.IMAGE_JPEG
                          },
                          referenceType: "asset"
                        }
                      ]
                    } : selectedAssetUrl && selectedAssetType === "video" ? {
                      video: {
                        gcsUri: getGcsUri(selectedAssetUrl),
                        mimeType: MIME.VIDEO_MP4
                      }
                    } : {})
                  }
                ],
                parameters: {
                  durationSeconds: DEFAULTS.DURATION_SECONDS,
                  sampleCount: DEFAULTS.SAMPLE_COUNT,
                  aspectRatio: DEFAULTS.ASPECT_RATIO
                }
              };
              onGenerate?.(payload);
            }}
            className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200"
           >
              <VideoIcon size={18} /> Generate
           </button>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
