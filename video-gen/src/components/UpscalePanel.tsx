"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Upload,
  Video as VideoIcon,
  Maximize2,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  X
} from "lucide-react";
import { storage, db } from "@/lib/firebase";
import { ref, listAll, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, addDoc, serverTimestamp, where } from "firebase/firestore";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { formatBytes, detectAspectRatioFromFile, validateVideoConstraints } from "@/utils/time";
import { getGcsUri } from "@/utils/gcs";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { VideoThumbnailCard } from "@/components/ui/VideoThumbnailCard";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SectionLabel } from "@/components/ui/SectionLabel";

interface UpscalePanelProps {
  onGenerate?: (payload: any, isLongRunning: boolean) => void;
  onVideoSelect?: (url: string | null, originalUrl?: string | null) => void;
}

const UpscalePanel = ({ onGenerate, onVideoSelect }: UpscalePanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video library
  const { videos, setVideos, loadingAssets, loadingMore, hasMore, fetchVideos, loadMoreVideos } = useVideoLibrary(
    currentProjectId,
    [where("isUpscaleOutput", "==", false)]
  );

  // Selection
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const detectAndSetAspectRatio = (url: string) => {
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => {
      const { videoWidth: w, videoHeight: h } = vid;
      if (w > 0 && h > 0) {
        setAspectRatio(w >= h ? "16:9" : "9:16");
      }
      vid.src = "";
    };
    vid.src = url;
  };

  const selectVideo = (url: string | null) => {
    setSelectedUrl(url);
    onVideoSelect?.(url);
    if (url) detectAndSetAspectRatio(url);
  };

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Options
  const [resolution, setResolution] = useState<"1080p" | "4k">("4k");
  const [compressionQuality, setCompressionQuality] = useState<"optimized" | "lossless" | "lossless_16bit_png">("optimized");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => { fetchVideos(); }, [fetchVideos, currentProjectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setUploadError("Please select a valid video file."); return; }

    const validationError = await validateVideoConstraints(file);
    if (validationError) { setUploadError(validationError); return; }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    const detectedRatio = await detectAspectRatioFromFile(file);

    const storageRef = ref(storage, `videos/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed",
      snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      err => { setUploadError("Upload failed: " + err.message); setIsUploading(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "videos"), {
            name: file.name,
            url: url,
            type: file.type,
            size: file.size,
            aspectRatio: detectedRatio,
            isUpscaleOutput: false,
            projectId: currentProjectId,
            createdAt: serverTimestamp(),
          });
          selectVideo(url);
          await fetchVideos();
        } catch (e) {
          console.error("Error saving video record", e);
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
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

      const selectedVideo = videos.find(v => v.url === selectedUrl);
      const payload = {
        _inputFileSize: selectedVideo?.size ?? null,
        instances: [{
          video: { gcsUri: getGcsUri(selectedUrl), mimeType: "video/mp4" },
          fps: 24
        }],
        parameters: {
          task: "upscale",
          compressionQuality,
          resolution,
          aspectRatio,
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
      <PanelHeader icon={<Sparkles size={13} />} title="4K Upscale" subtitle="Upload or select a video, then submit to upscale" />

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
          <SectionLabel>Media Library</SectionLabel>
          {loadingAssets ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="text-slate-300 animate-spin" />
            </div>
          ) : videos.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-6">No videos in library</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {videos.map(vid => (
                <VideoThumbnailCard
                  key={vid.id}
                  vid={vid}
                  isSelected={selectedUrl === vid.url}
                  onClick={() => selectVideo(vid.url)}
                />
              ))}
            </div>
          )}
          {hasMore && <LoadMoreButton loading={loadingMore} onClick={loadMoreVideos} />}
        </div>

        {/* Options */}
        <div className="space-y-3 pt-1 border-t border-slate-100">
          <SectionLabel>Output Settings</SectionLabel>

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aspect Ratio</span>
            <div className="flex items-end gap-3">
              {([
                { value: "16:9", w: 48, h: 27 },
                { value: "9:16", w: 27, h: 48 },
              ] as const).map(({ value, w, h }) => (
                <button
                  key={value}
                  onClick={() => setAspectRatio(value)}
                  className={`flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 transition-all ${
                    aspectRatio === value
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div
                    className={`rounded border-2 transition-colors ${
                      aspectRatio === value ? "border-blue-500 bg-blue-200" : "border-slate-300 bg-slate-200"
                    }`}
                    style={{ width: w, height: h }}
                  />
                  <span className={`text-[10px] font-bold tracking-wide ${aspectRatio === value ? "text-blue-600" : "text-slate-400"}`}>
                    {value}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution + Compression */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
              {(["1080p", "4k"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
                    resolution === r ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {r === "4k" ? "4K" : "1080p"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5 flex-1">
              {([
                { value: "optimized", label: "Opt" },
                { value: "lossless", label: "Lossless" },
                { value: "lossless_16bit_png", label: "16-bit" },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setCompressionQuality(value)}
                  className={`flex-1 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
                    compressionQuality === value ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Submit bar */}
      <div className="p-4 pb-16 border-t border-slate-100 bg-slate-50 shrink-0 space-y-2">
        {confirmed && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold px-3 py-2 rounded-lg">
            <CheckCircle size={14} /> Job submitted! Track progress in the Task Monitor.
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
            <><Maximize2 size={16} /> Upscale to {resolution === "4k" ? "4K" : "1080p"}</>
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
