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
import { collection, getDocs, query, limit, where, addDoc, serverTimestamp, orderBy, startAfter, QueryDocumentSnapshot } from "firebase/firestore";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { formatBytes, detectAspectRatioFromFile } from "@/utils/time";

interface UpscalePanelProps {
  onGenerate?: (payload: any, isLongRunning: boolean) => void;
  onVideoSelect?: (url: string | null, originalUrl?: string | null) => void;
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
  const { currentProjectId } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Video library
  const PAGE_SIZE = 4;
  const [videos, setVideos] = useState<{ id: string; name: string; url: string; size?: number; aspectRatio?: string }[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);

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

  const fetchVideos = useCallback(async () => {
    if (!currentProjectId) { setVideos([]); setLoadingAssets(false); return; }
    setLoadingAssets(true);
    lastDocRef.current = null;
    try {
      const snap = await getDocs(query(
        collection(db, "videos"),
        where("projectId", "==", currentProjectId),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      ));
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
      setVideos(snap.docs.map(d => ({ id: d.id, name: d.data().name || "Untitled", url: d.data().url || "", size: d.data().size || undefined, aspectRatio: d.data().aspectRatio || undefined })));
    } catch (e) {
      console.error("Error fetching videos", e);
    } finally {
      setLoadingAssets(false);
    }
  }, [currentProjectId]);

  const loadMoreVideos = async () => {
    if (!currentProjectId || !lastDocRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(
        collection(db, "videos"),
        where("projectId", "==", currentProjectId),
        orderBy("createdAt", "desc"),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      ));
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? lastDocRef.current;
      setHasMore(snap.docs.length === PAGE_SIZE);
      setVideos(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, name: d.data().name || "Untitled", url: d.data().url || "", size: d.data().size || undefined, aspectRatio: d.data().aspectRatio || undefined }))]);
    } catch (e) {
      console.error("Error loading more videos", e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setUploadError("Please select a valid video file."); return; }

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
            source: "upscale_input",
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
                  className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all group active:scale-95
                    ${selectedUrl === vid.url ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"}`}
                  style={{ aspectRatio: vid.aspectRatio === "9:16" ? "9/16" : "16/9" }}
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
                  {vid.size && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded">
                      {formatBytes(vid.size)}
                    </div>
                  )}
                  {selectedUrl === vid.url && (
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded">✓</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              onClick={loadMoreVideos}
              disabled={loadingMore}
              className="w-full py-2 mt-1 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={12} className="animate-spin" /> : null}
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>

        {/* Options */}
        <div className="space-y-3 pt-1 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Output Settings</p>

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
