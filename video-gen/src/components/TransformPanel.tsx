"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Upload,
  Wand2,
  Clapperboard,
  Loader2,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  X,
  Image as ImageIcon,
  Film,
} from "lucide-react";
import { storage, db } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, getDocs, query, limit, where, addDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { getGcsUri } from "@/utils/gcs";
import { formatBytes, detectAspectRatioFromFile, validateVideoConstraints } from "@/utils/time";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { VideoThumbnailCard } from "@/components/ui/VideoThumbnailCard";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SectionLabel } from "@/components/ui/SectionLabel";

interface TransformPanelProps {
  onGenerate?: (payload: any, isLongRunning: boolean) => void;
  onVideoSelect?: (url: string | null) => void;
}

const TransformPanel = ({ onGenerate, onVideoSelect }: TransformPanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const maskFileInputRef = useRef<HTMLInputElement>(null);

  const { videos, setVideos, loadingAssets, loadingMore, hasMore, fetchVideos, loadMoreVideos } = useVideoLibrary(currentProjectId);

  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [controlImageUrl, setControlImageUrl] = useState<string | null>(null);
  const [maskVideoUrl, setMaskVideoUrl] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [strength, setStrength] = useState(0.88);
  const [steps, setSteps] = useState(20);
  const [stepsInput, setStepsInput] = useState("20");
  const [compressionQuality, setCompressionQuality] = useState<"optimized" | "lossless">("optimized");

  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const [isUploadingMask, setIsUploadingMask] = useState(false);
  const [maskUploadProgress, setMaskUploadProgress] = useState(0);
  const [maskUploadError, setMaskUploadError] = useState<string | null>(null);

  const [maskVideos, setMaskVideos] = useState<{ id: string; name: string; url: string }[]>([]);
  const [loadingMasks, setLoadingMasks] = useState(true);
  const [showMaskLibrary, setShowMaskLibrary] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => { fetchVideos(); }, [fetchVideos, currentProjectId]);

  const fetchMaskVideos = useCallback(async () => {
    setLoadingMasks(true);
    try {
      const snap = await getDocs(query(
        collection(db, "maskVideos"),
        where("projectId", "==", currentProjectId ?? "__none__"),
        limit(20)
      ));
      setMaskVideos(snap.docs.map(d => ({ id: d.id, name: d.data().name || "Untitled", url: d.data().url || "" })).reverse());
    } catch (e) {
      console.error("Error fetching mask videos", e);
    } finally {
      setLoadingMasks(false);
    }
  }, [currentProjectId]);

  useEffect(() => { fetchMaskVideos(); }, [fetchMaskVideos]);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setVideoUploadError("Please select a valid video file."); return; }

    const validationError = await validateVideoConstraints(file);
    if (validationError) { setVideoUploadError(validationError); return; }

    setIsUploadingVideo(true);
    setVideoUploadProgress(0);
    setVideoUploadError(null);

    const detectedRatio = await detectAspectRatioFromFile(file);

    const storageRef = ref(storage, `videos/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed",
      snap => setVideoUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      err => { setVideoUploadError("Upload failed: " + err.message); setIsUploadingVideo(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "videos"), {
            name: file.name, url, type: file.type, size: file.size,
            aspectRatio: detectedRatio, isUpscaleOutput: false,
            projectId: currentProjectId, createdAt: serverTimestamp(),
          });
          setSelectedVideoUrl(url);
          onVideoSelect?.(url);
          await fetchVideos();
        } catch (e) { console.error(e); }
        finally {
          setIsUploadingVideo(false);
          if (videoFileInputRef.current) videoFileInputRef.current.value = "";
        }
      }
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setImageUploadError("Please select a valid image file."); return; }

    setIsUploadingImage(true);
    setImageUploadError(null);

    const storageRef = ref(storage, `images/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed",
      () => {},
      err => { setImageUploadError("Upload failed: " + err.message); setIsUploadingImage(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          setControlImageUrl(url);
        } catch (e) { console.error(e); }
        finally {
          setIsUploadingImage(false);
          if (imageFileInputRef.current) imageFileInputRef.current.value = "";
        }
      }
    );
  };

  const handleMaskUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setMaskUploadError("Please select a valid video file."); return; }

    setIsUploadingMask(true);
    setMaskUploadProgress(0);
    setMaskUploadError(null);

    const storageRef = ref(storage, `masks/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed",
      snap => setMaskUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      err => { setMaskUploadError("Upload failed: " + err.message); setIsUploadingMask(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "maskVideos"), {
            name: file.name, url, type: file.type, size: file.size,
            projectId: currentProjectId, createdAt: serverTimestamp(),
          });
          setMaskVideoUrl(url);
          await fetchMaskVideos();
        } catch (e) { console.error(e); }
        finally {
          setIsUploadingMask(false);
          if (maskFileInputRef.current) maskFileInputRef.current.value = "";
        }
      }
    );
  };

  const handleStepsChange = (val: string) => {
    setStepsInput(val);
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1 && n <= 250) setSteps(n);
  };

  const handleStepsBlur = () => {
    const n = Math.max(1, Math.min(250, isNaN(steps) ? 20 : steps));
    setSteps(n);
    setStepsInput(String(n));
  };

  const handleSubmit = async () => {
    if (!selectedVideoUrl) return;
    setSubmitting(true);
    setSubmitError(null);
    setConfirmed(false);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");
      const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

      const selectedVideo = videos.find(v => v.url === selectedVideoUrl);
      const payload = {
        _model: "veo-experimental",
        _inputFileSize: selectedVideo?.size ?? null,
        instances: [{
          prompt,
          video: { gcsUri: getGcsUri(selectedVideoUrl), mimeType: "video/mp4" },
          ...(controlImageUrl ? { image: { gcsUri: getGcsUri(controlImageUrl), mimeType: "image/jpeg" } } : {}),
        }],
        parameters: {
          seed: 777,
          compressionQuality,
          storageUri: outputUri,
          experiments: {
            modelName: "veo-exp-video-transform",
            videoTransformStrength: strength,
            numDiffusionSteps: steps,
            ...(maskVideoUrl ? { videoTransformMaskGcsUri: getGcsUri(maskVideoUrl) } : {}),
          },
        },
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
      <PanelHeader icon={<Clapperboard size={13} />} title="Video Transform" subtitle="Select a video, set controls, and transform" />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Input Video */}
        <div className="space-y-2">
          <SectionLabel>Input Video</SectionLabel>
          <div
            onClick={() => !isUploadingVideo && !selectedVideoUrl && videoFileInputRef.current?.click()}
            className={`relative aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors
              ${isUploadingVideo ? "border-blue-300 bg-blue-50 cursor-not-allowed" :
                selectedVideoUrl ? "border-slate-200 bg-slate-50 p-0 overflow-hidden cursor-default" :
                "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 cursor-pointer"}`}
          >
            {isUploadingVideo ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={28} className="text-blue-500 animate-spin" />
                <p className="text-xs font-bold text-slate-600">{Math.round(videoUploadProgress)}% Uploading…</p>
              </div>
            ) : selectedVideoUrl ? (
              <>
                <video src={selectedVideoUrl + "#t=0.5"} className="w-full h-full object-cover rounded-xl" preload="metadata" muted playsInline />
                <button
                  onClick={e => { e.stopPropagation(); setSelectedVideoUrl(null); onVideoSelect?.(null); }}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-md">Selected</div>
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
          {videoUploadError && (
            <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> {videoUploadError}
            </div>
          )}
          <input ref={videoFileInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
        </div>

        {/* Media library — only shown when nothing selected */}
        {!selectedVideoUrl && (
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
                    onClick={() => { setSelectedVideoUrl(vid.url); onVideoSelect?.(vid.url); }}
                  />
                ))}
              </div>
            )}
            {hasMore && <LoadMoreButton loading={loadingMore} onClick={loadMoreVideos} />}
            <button
              onClick={() => videoFileInputRef.current?.click()}
              className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Upload size={12} /> Upload new video
            </button>
          </div>
        )}

        {/* Control Image (optional) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Control Image <span className="text-slate-400 normal-case font-normal">(optional)</span></SectionLabel>
            {controlImageUrl && (
              <button onClick={() => setControlImageUrl(null)} className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition-colors">
                Remove
              </button>
            )}
          </div>
          <div
            onClick={() => !isUploadingImage && imageFileInputRef.current?.click()}
            className={`relative h-24 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-colors cursor-pointer overflow-hidden
              ${isUploadingImage ? "border-blue-300 bg-blue-50 cursor-not-allowed" :
                controlImageUrl ? "border-slate-200 p-0" :
                "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300"}`}
          >
            {isUploadingImage ? (
              <Loader2 size={20} className="text-blue-500 animate-spin" />
            ) : controlImageUrl ? (
              <>
                <img src={controlImageUrl} alt="Control" className="w-full h-full object-cover" />
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-md">Control Image</div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-slate-400">
                <ImageIcon size={16} />
                <span className="text-[11px] font-semibold text-slate-500">Upload control image</span>
              </div>
            )}
          </div>
          {imageUploadError && (
            <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> {imageUploadError}
            </div>
          )}
          <input ref={imageFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>

        {/* Mask Video (optional) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Mask Video <span className="text-slate-400 normal-case font-normal">(optional)</span></SectionLabel>
            {maskVideoUrl && (
              <button onClick={() => { setMaskVideoUrl(null); setShowMaskLibrary(false); }} className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition-colors">
                Remove
              </button>
            )}
          </div>

          {/* Selected mask preview */}
          {maskVideoUrl ? (
            <div className="relative h-24 rounded-xl overflow-hidden border border-blue-200 bg-black">
              <video
                src={maskVideoUrl + "#t=0.5"}
                className="w-full h-full object-cover opacity-90"
                preload="metadata"
                muted
                playsInline
                onMouseEnter={e => e.currentTarget.play()}
                onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0.5; }}
              />
              <button
                onClick={() => { setMaskVideoUrl(null); setShowMaskLibrary(false); }}
                className="absolute top-1.5 right-1.5 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
              >
                <X size={12} />
              </button>
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-md flex items-center gap-1">
                <Film size={9} /> Mask Selected
              </div>
            </div>
          ) : (
            <>
              {/* Empty state with actions */}
              {!showMaskLibrary && (
                <div className="flex gap-2">
                  {maskVideos.length > 0 && (
                    <button
                      onClick={() => setShowMaskLibrary(true)}
                      className="flex-1 py-2 border border-dashed border-slate-300 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Film size={12} /> Browse library
                    </button>
                  )}
                  <button
                    onClick={() => !isUploadingMask && maskFileInputRef.current?.click()}
                    className="flex-1 py-2 border border-dashed border-slate-300 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isUploadingMask ? (
                      <><Loader2 size={12} className="animate-spin" /> {Math.round(maskUploadProgress)}%</>
                    ) : (
                      <><Upload size={12} /> Upload mask</>
                    )}
                  </button>
                </div>
              )}

              {/* Mask library grid (shown on demand) */}
              {showMaskLibrary && (
                <>
                  {loadingMasks ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={18} className="text-slate-300 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {maskVideos.map(mv => (
                        <div
                          key={mv.id}
                          onClick={() => { setMaskVideoUrl(mv.url); setShowMaskLibrary(false); }}
                          className="relative aspect-video rounded-lg overflow-hidden border-2 border-slate-200 hover:border-blue-400 cursor-pointer transition-all group active:scale-95"
                          title={mv.name}
                        >
                          <video
                            src={mv.url + "#t=0.5"}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                            onMouseEnter={e => e.currentTarget.play()}
                            onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0.5; }}
                          />
                          <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/20 transition-colors flex items-center justify-center">
                            <PlayCircle size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => !isUploadingMask && maskFileInputRef.current?.click()}
                    className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Upload size={12} /> Upload new mask
                  </button>
                </>
              )}
            </>
          )}

          {maskUploadError && (
            <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> {maskUploadError}
            </div>
          )}
          <input ref={maskFileInputRef} type="file" accept="video/*" className="hidden" onChange={handleMaskUpload} />
        </div>

        {/* Control Prompt */}
        <div className="space-y-2">
          <SectionLabel>Control Prompt</SectionLabel>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the transformation…"
            className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Control Strength */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Control Strength</SectionLabel>
            <span className="text-[12px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
              {strength.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={strength}
            onChange={e => setStrength(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[9px] text-slate-400 font-mono">
            <span>0.00</span>
            <span>0.50</span>
            <span>1.00</span>
          </div>
        </div>

        {/* Diffusion Steps */}
        <div className="space-y-2">
          <SectionLabel>Diffusion Steps <span className="text-slate-400 normal-case font-normal">(1–250)</span></SectionLabel>
          <input
            type="number"
            min="1"
            max="250"
            value={stepsInput}
            onChange={e => handleStepsChange(e.target.value)}
            onBlur={handleStepsBlur}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>

        {/* Compression Quality */}
        <div className="space-y-2">
          <SectionLabel>Compression Quality</SectionLabel>
          <div className="flex gap-2">
            {(["optimized", "lossless"] as const).map(q => (
              <button
                key={q}
                onClick={() => setCompressionQuality(q)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                  compressionQuality === q
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {q.charAt(0).toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Submit bar */}
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
          disabled={!selectedVideoUrl || submitting}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> Submitting…</>
          ) : (
            <><Clapperboard size={16} /> Transform Video</>
          )}
        </button>
        {!selectedVideoUrl && (
          <p className="text-[10px] text-slate-400 text-center">Select a video above to enable transform</p>
        )}
      </div>
    </div>
  );
};

export default TransformPanel;
