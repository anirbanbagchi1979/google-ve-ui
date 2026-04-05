"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Upload,
  Video as VideoIcon,
  Maximize2,
  Loader2,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  X
} from "lucide-react";
import { storage, db } from "@/lib/firebase";
import { ref, listAll, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { useConfig } from "@/context/ConfigContext";

interface UpscalePanelProps {
  onGenerate?: (payload: any, isLongRunning?: boolean) => void;
  onVideoSelect?: (url: string | null) => void;
}

const getGcsUri = (url: string | null) => {
  if (!url) return "";
  if (url.startsWith("gs://")) return url;
  if (url.includes("firebasestorage.googleapis.com")) {
    try {
      const decodedUrl = decodeURIComponent(url);
      const bucketMatch = url.match(/\/b\/([^/]+)/);
      const pathMatch = decodedUrl.match(/\/o\/([^?]+)/);
      if (bucketMatch && pathMatch) return `gs://${bucketMatch[1]}/${pathMatch[1]}`;
    } catch (e) {}
  }
  return `gs://video-gen-assets/${url.split("/").pop()?.split("?")[0]}`;
};

const UpscalePanel = ({ onGenerate, onVideoSelect }: UpscalePanelProps) => {
  const { config } = useConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video library
  const [videos, setVideos] = useState<{ id: string; name: string; url: string }[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  // Selection
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const selectVideo = (url: string | null) => { setSelectedUrl(url); onVideoSelect?.(url); };

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoadingAssets(true);
    try {
      // From Firestore videos collection
      const snap = await getDocs(query(collection(db, "videos"), limit(20)));
      const list = snap.docs.map(d => ({ id: d.id, name: d.data().name || "Untitled", url: d.data().url || "" }));
      setVideos(list.reverse());
    } catch (e) {
      console.error("Error fetching videos", e);
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setUploadError("Please select a valid video file."); return; }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    const storageRef = ref(storage, `videos/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed",
      snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      err => { setUploadError("Upload failed: " + err.message); setIsUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        selectVideo(url);
        await fetchVideos();
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    );
  };

  const handleSubmit = async () => {
    if (!selectedUrl) return;
    setSubmitting(true);
    setSubmitError(null);
    setConfirmed(false);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");
      const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

      const payload = {
        instances: [{
          video: { gcsUri: getGcsUri(selectedUrl), mimeType: "video/mp4" },
          fps: 24
        }],
        parameters: {
          task: "upscale",
          compressionQuality: "optimized",
          resolution: "4k",
          aspectRatio: "16:9",
          storageUri: outputUri,
          experiments: { modelName: "veo3p1_upscale" }
        }
      };

      await onGenerate?.(payload, true);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 5000);
    } catch (err: any) {
      setSubmitError(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
        <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
          <Maximize2 size={13} className="text-white" />
        </div>
        <div>
          <p className="text-[12px] font-bold text-blue-900">4K Upscale</p>
          <p className="text-[10px] text-blue-500">Upload or select a video, then submit to upscale</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Drop / upload zone */}
        <div
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`relative aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer
            ${isUploading ? "border-blue-300 bg-blue-50 cursor-not-allowed" :
              selectedUrl ? "border-slate-200 bg-slate-50 p-0 overflow-hidden" :
              "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300"}`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={28} className="text-blue-500 animate-spin" />
              <p className="text-xs font-bold text-slate-600">{Math.round(uploadProgress)}% Uploading…</p>
            </div>
          ) : selectedUrl ? (
            <>
              <video
                src={selectedUrl + "#t=0.5"}
                className="w-full h-full object-cover rounded-xl"
                preload="metadata"
                muted
                playsInline
              />
              <button
                onClick={e => { e.stopPropagation(); selectVideo(null); }}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
              >
                <X size={12} />
              </button>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-md">
                Selected
              </div>
            </>
          ) : (
            <>
              <div className="p-3 bg-white rounded-lg shadow-sm border border-slate-100 text-slate-400">
                <Upload size={22} />
              </div>
              <div className="text-center px-4">
                <p className="text-sm font-bold text-slate-600">Upload or select a video</p>
                <p className="text-[10px] text-slate-400 mt-0.5">MP4 · MOV · WebM</p>
              </div>
            </>
          )}
        </div>
        {uploadError && (
          <div className="flex items-center gap-2 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
            <AlertCircle size={13} /> {uploadError}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleUpload} />

        {/* Media library — videos only */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Media Assets</p>
          {loadingAssets ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="text-slate-300 animate-spin" />
            </div>
          ) : videos.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-6">No videos in library</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {videos.map(vid => (
                <div
                  key={vid.id}
                  onClick={() => selectVideo(vid.url)}
                  className={`relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all group active:scale-95
                    ${selectedUrl === vid.url ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <video
                    src={vid.url + "#t=0.5"}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    muted
                    playsInline
                    onMouseEnter={e => e.currentTarget.play()}
                    onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0.5; }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <PlayCircle size={20} className="text-white" />
                  </div>
                  {selectedUrl === vid.url && (
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded">✓</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Submit bar — padded above the fixed debug console bar (h-12 = 48px) */}
      <div className="p-4 pb-16 border-t border-slate-100 bg-slate-50 shrink-0 space-y-3">
        {confirmed && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold px-3 py-2 rounded-lg">
            <CheckCircle size={14} /> Job submitted! Track progress in the Tasks panel.
          </div>
        )}
        {submitError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-[11px] px-3 py-2 rounded-lg">
            <AlertCircle size={14} /> {submitError}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={!selectedUrl || submitting}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> Submitting…</>
          ) : (
            <><Maximize2 size={16} /> Upscale to 4K</>
          )}
        </button>
        {!selectedUrl && (
          <p className="text-[10px] text-slate-400 text-center">Select a video above to enable upscaling</p>
        )}
      </div>
    </div>
  );
};

export default UpscalePanel;
