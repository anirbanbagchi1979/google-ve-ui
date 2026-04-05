"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Upload,
  Folder,
  ChevronDown,
  Monitor,
  Clock,
  Settings2,
  LayoutGrid,
  Loader2,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  Maximize2
} from "lucide-react";
import { storage, db } from "@/lib/firebase";
import { ref, listAll, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query, getDocs, orderBy, limit, where } from "firebase/firestore";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";

interface VideoAsset {
  id: string;
  name: string;
  url: string;
  createdAt: any;
}

interface ControlPanelProps {
  onVideoSelect?: (url: string) => void;
  onGenerate?: (payload: any, isLongRunning?: boolean) => void;
}

const getGcsUri = (url: string | null) => {
  if (!url) return "";
  if (url.startsWith("gs://")) return url;
  if (url.includes("firebasestorage.googleapis.com")) {
    try {
      // Decode the URL and extract the bucket and path
      const decodedUrl = decodeURIComponent(url);
      const bucketMatch = url.match(/\/b\/([^\/]+)/);
      const pathMatch = decodedUrl.match(/\/o\/([^\?]+)/);
      
      if (bucketMatch && pathMatch) {
        return `gs://${bucketMatch[1]}/${pathMatch[1]}`;
      }
    } catch (e) {
      console.error("Error parsing Firebase URL", e);
    }
  }
  return `gs://video-gen-assets/${url.split("/").pop()?.split("?")[0]}`;
};

const ControlPanel = ({ onVideoSelect, onGenerate }: ControlPanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();
  const [activeTab, setActiveTab] = useState<"Image" | "Video" | "Audio">("Video");
  const [assetFilter, setAssetFilter] = useState<"Image" | "Video">("Video");
  
  // Asset States
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  // Video Upload States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchVideos = useCallback(async () => {
    if (!currentProjectId) {
      setVideos([]);
      return;
    }
    try {
      const q = query(
        collection(db, "videos"), 
        where("projectId", "==", currentProjectId), 
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const videoList: VideoAsset[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        videoList.push({ 
          id: doc.id, 
          name: data.name || "Untitled",
          url: data.url || "",
          createdAt: data.createdAt
        });
      });
      setVideos(videoList.reverse()); 
    } catch (err) {
      console.error("Error fetching videos", err);
    }
  }, [currentProjectId]);

  const loadAllAssets = useCallback(async () => {
    setLoadingAssets(true);
    setAssetError(null);
    try {
      await Promise.all([fetchImages(), fetchVideos()]);
    } catch (err) {
      console.error("Asset load error", err);
      setAssetError("Failed to load some assets.");
    } finally {
      setLoadingAssets(false);
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

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setUploadError("Please select a valid video file.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadSuccess(false);
    setUploadError(null);

    try {
      const storageRef = ref(storage, `videos/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        }, 
        (error) => {
          setUploadError("Upload failed: " + error.message);
          setIsUploading(false);
        }, 
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            await addDoc(collection(db, "videos"), {
              name: file.name,
              url: downloadURL,
              type: file.type,
              size: file.size,
              projectId: currentProjectId,
              createdAt: serverTimestamp(),
            });

            await fetchVideos();
            setAssetFilter("Video");
            setUploadSuccess(true);
            if (fileInputRef.current) fileInputRef.current.value = "";
          } catch (err: any) {
            setUploadError("Error saving record: " + err.message);
          } finally {
            setIsUploading(false);
            setTimeout(() => setUploadSuccess(false), 3000);
          }
        }
      );
    } catch (err: any) {
      setUploadError("Something went wrong.");
      setIsUploading(false);
    }
  };

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
        <button 
          onClick={() => setActiveTab("Audio")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-all ${
            activeTab === "Audio" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Music size={16} /> Audio
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Upload Section */}
        <div 
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`relative group cursor-pointer ${isUploading ? 'cursor-not-allowed' : ''}`}
        >
          <div className="aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3 transition-colors group-hover:bg-slate-100 group-hover:border-slate-300">
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
                <p className="text-xs font-bold text-slate-600">{Math.round(uploadProgress)}% Uploading...</p>
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
                        
                         const now = new Date();
                         const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
                         const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

                         const payload = {
                           instances: [{
                             video: {
                               gcsUri: getGcsUri(selectedAssetUrl),
                               mimeType: "video/mp4"
                             },
                             fps: 24
                           }],
                           parameters: {
                             task: "upscale",
                             compressionQuality: "optimized",
                             resolution: "4k",
                             aspectRatio: "16:9",
                             storageUri: outputUri,
                             experiments: { "modelName": "veo3p1_upscale" }
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
          {uploadError && (
             <div className="mt-2 flex items-center gap-2 text-red-500 text-[10px] font-medium bg-red-50 p-2 rounded-lg">
                <AlertCircle size={14} /> {uploadError}
             </div>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleVideoUpload} 
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
            <h3 className="text-sm font-bold flex items-center gap-2 text-slate-700">
               <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
               Recent Assets
            </h3>
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
                <div className="aspect-video bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center">
                  <Loader2 size={16} className="text-slate-300 animate-spin" />
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
                  <div className="aspect-video bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-300 text-[10px]">
                    No images
                  </div>
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
                    className={`aspect-video rounded-lg overflow-hidden border-2 transition-all group relative cursor-pointer active:scale-95 flex items-center justify-center ${
                      selectedAssetUrl === vid.url ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200"
                    }`}
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
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <PlayCircle size={20} className="text-white" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="aspect-video bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-300 text-[10px]">
                  No videos
                </div>
              )}
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button className="p-1.5 hover:bg-slate-200 rounded-md text-slate-500 transition-colors">
              <Settings2 size={18} />
            </button>
            {/* Presets button removed */}
          </div>
          <div className="flex gap-1">
            <button className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold shadow-sm">
              <Monitor size={12} /> 16:9
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold shadow-sm">
              <Clock size={12} /> 5s
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <button className="flex-1/3 flex items-center justify-between px-3 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all active:scale-95">
              <span className="flex items-center gap-1.5 min-w-[70px]"><LayoutGrid size={16} /> Gen-4.5</span>
              <ChevronDown size={14} />
           </button>
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
                            mimeType: "image/jpeg"
                          },
                          referenceType: "asset"
                        }
                      ]
                    } : selectedAssetUrl && selectedAssetType === "video" ? {
                      video: {
                        gcsUri: getGcsUri(selectedAssetUrl),
                        mimeType: "video/mp4"
                      }
                    } : {})
                  }
                ],
                parameters: {
                  durationSeconds: 5,
                  sampleCount: 1,
                  aspectRatio: "16:9"
                }
              };
              onGenerate?.(payload);
            }}
            className="flex-1 py-3.5 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200"
           >
              <VideoIcon size={18} /> Generate
           </button>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
