"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Upload,
  Drama,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Image as ImageIcon,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { storage, db } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { getGcsUri } from "@/utils/gcs";
import { formatBytes, detectAspectRatioFromFile, validateVideoConstraints, getVideoDimensions, resizeImageToMatchVideo } from "@/utils/time";
import { buildPerfEstimationPayload, buildPerfGenerationPayload } from "@/utils/payload";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { VideoThumbnailCard } from "@/components/ui/VideoThumbnailCard";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { SectionLabel } from "@/components/ui/SectionLabel";

import { usePerfMeshLibrary } from "@/hooks/usePerfMeshLibrary";
import { usePerfCharacterLibrary } from "@/hooks/usePerfCharacterLibrary";

interface PerformancePanelProps {
  onGenerate?: (payload: any, isLongRunning: boolean) => void;
  onVideoSelect?: (url: string | null, originalUrl?: string | null, leftLabel?: string, rightLabel?: string) => void;
}

const PerformancePanel = ({ onGenerate, onVideoSelect }: PerformancePanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();

  // Step management
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<"extract" | "useMesh">("extract");

  // Step 1 — Extract New
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const { videos, loadingAssets, loadingMore, hasMore, fetchVideos, loadMoreVideos } = useVideoLibrary(currentProjectId);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [extractionSeed, setExtractionSeed] = useState(777);
  const [showExtractSettings, setShowExtractSettings] = useState(false);

  // Step 1 — Use Mesh
  const meshFileInputRef = useRef<HTMLInputElement>(null);
  const { meshes, loading: loadingMeshes, fetchMeshes } = usePerfMeshLibrary(currentProjectId);
  const [isUploadingMesh, setIsUploadingMesh] = useState(false);
  const [meshUploadProgress, setMeshUploadProgress] = useState(0);
  const [meshUploadError, setMeshUploadError] = useState<string | null>(null);

  // Shared: selected mesh (from either tab or from job tracker)
  const [selectedMeshGcsUri, setSelectedMeshGcsUri] = useState<string | null>(null);
  const [selectedMeshUrl, setSelectedMeshUrl] = useState<string | null>(null);
  const [selectedMeshSourceVideoUrl, setSelectedMeshSourceVideoUrl] = useState<string | null>(null);

  // Video dimensions — captured from source video or mesh to resize character images
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Step 2
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const { characters, loading: loadingCharacters, fetchCharacters } = usePerfCharacterLibrary(currentProjectId);
  const [characterImageUrl, setCharacterImageUrl] = useState<string | null>(null);
  const [characterImageGcsUri, setCharacterImageGcsUri] = useState<string | null>(null);
  const [characterImageMimeType, setCharacterImageMimeType] = useState<string>("image/png");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generationSeed, setGenerationSeed] = useState(78);
  const [compressionQuality, setCompressionQuality] = useState<"optimized" | "lossless">("optimized");

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => { fetchVideos(); }, [fetchVideos, currentProjectId]);
  useEffect(() => { fetchMeshes(); }, [fetchMeshes]);

  // --- Upload handlers ---

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
          // Capture video dimensions for character image resizing
          try { setVideoDimensions(await getVideoDimensions(url)); } catch { /* fallback: no resize */ }
          onVideoSelect?.(url, null, "Source Video", "");
          await fetchVideos();
        } catch (e) { console.error(e); }
        finally {
          setIsUploadingVideo(false);
          if (videoFileInputRef.current) videoFileInputRef.current.value = "";
        }
      }
    );
  };

  const handleMeshUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setMeshUploadError("Please select a valid video file."); return; }

    setIsUploadingMesh(true);
    setMeshUploadProgress(0);
    setMeshUploadError(null);

    const storageRef = ref(storage, `perfMeshes/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed",
      snap => setMeshUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      err => { setMeshUploadError("Upload failed: " + err.message); setIsUploadingMesh(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const gcsUri = getGcsUri(url);
          await addDoc(collection(db, "perfMeshes"), {
            name: file.name, url, gcsUri,
            projectId: currentProjectId, createdAt: serverTimestamp(),
          });
          setSelectedMeshGcsUri(gcsUri);
          setSelectedMeshUrl(url);
          setSelectedMeshSourceVideoUrl(null);
          await fetchMeshes();
        } catch (e) { console.error(e); }
        finally {
          setIsUploadingMesh(false);
          if (meshFileInputRef.current) meshFileInputRef.current.value = "";
        }
      }
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setImageUploadError("Please select a valid image file."); return; }

    setIsUploadingImage(true);
    setImageUploadError(null);

    // Resize image to match video dimensions if available
    if (videoDimensions) {
      try {
        file = await resizeImageToMatchVideo(file, videoDimensions.width, videoDimensions.height);
      } catch (err) {
        console.warn("Image resize failed, uploading original:", err);
      }
    }

    const storageRef = ref(storage, `images/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on("state_changed",
      () => {},
      err => { setImageUploadError("Upload failed: " + err.message); setIsUploadingImage(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const gcsUri = getGcsUri(url);
          const mimeType = file!.type === "image/png" ? "image/png" : "image/jpeg";
          setCharacterImageUrl(url);
          setCharacterImageGcsUri(gcsUri);
          setCharacterImageMimeType(mimeType);
          // Save to perfCharacters collection for reuse
          await addDoc(collection(db, "perfCharacters"), {
            name: file!.name, url, gcsUri, mimeType,
            projectId: currentProjectId, createdAt: serverTimestamp(),
          });
          await fetchCharacters();
        } catch (e) { console.error(e); }
        finally {
          setIsUploadingImage(false);
          if (imageFileInputRef.current) imageFileInputRef.current.value = "";
        }
      }
    );
  };

  // --- Submit handlers ---

  const handleExtractSubmit = async () => {
    if (!selectedVideoUrl) return;
    setSubmitting(true);
    setSubmitError(null);
    setConfirmed(false);

    try {
      const videoGcsUri = getGcsUri(selectedVideoUrl);
      const payload = buildPerfEstimationPayload(videoGcsUri, config, extractionSeed);
      // Attach extra metadata for the completion handler
      (payload as any)._inputVideoUrl = selectedVideoUrl;
      (payload as any)._inputFileSize = null;
      await onGenerate?.(payload, true);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 5000);
    } catch (err: any) {
      setSubmitError(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateSubmit = async () => {
    if (!selectedMeshGcsUri || !characterImageGcsUri) return;
    setSubmitting(true);
    setSubmitError(null);
    setConfirmed(false);

    try {
      const payload = buildPerfGenerationPayload(
        selectedMeshGcsUri,
        characterImageGcsUri,
        characterImageMimeType,
        config,
        { prompt: prompt || undefined, seed: generationSeed, compressionQuality }
      );
      // Attach extra metadata
      (payload as any)._meshVideoUrl = selectedMeshUrl;
      (payload as any)._characterImageUrl = characterImageUrl;
      (payload as any)._sourceVideoUrl = selectedMeshSourceVideoUrl;
      (payload as any)._inputFileSize = null;
      await onGenerate?.(payload, true);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 5000);
    } catch (err: any) {
      setSubmitError(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Job tracker callbacks ---

  // --- Advance to step 2 from Use Mesh tab ---

  const handleContinueToStep2 = () => {
    if (selectedMeshGcsUri && selectedMeshUrl) {
      setCurrentStep(2);
    }
  };

  // --- Render ---

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <PanelHeader icon={<Drama size={13} />} title="Performance Control" subtitle="Extract motion, then apply to character" />

      {/* Stepper */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
        <button
          onClick={() => setCurrentStep(1)}
          className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors ${
            currentStep === 1 ? "text-blue-600" : selectedMeshGcsUri ? "text-emerald-500" : "text-slate-400"
          }`}
        >
          {selectedMeshGcsUri && currentStep === 2 ? (
            <CheckCircle size={14} className="text-emerald-500" />
          ) : (
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
              currentStep === 1 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
            }`}>1</span>
          )}
          Motion Source
        </button>

        <div className="flex-1 h-px bg-slate-200" />

        <button
          onClick={() => selectedMeshGcsUri && setCurrentStep(2)}
          className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors ${
            currentStep === 2 ? "text-blue-600" : "text-slate-400"
          } ${!selectedMeshGcsUri ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={!selectedMeshGcsUri}
        >
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
            currentStep === 2 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
          }`}>2</span>
          Generate
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {currentStep === 1 ? (
          <>
            {/* Tab toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setActiveTab("extract")}
                className={`flex-1 py-2 text-[11px] font-bold transition-all ${
                  activeTab === "extract" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                Extract New
              </button>
              <button
                onClick={() => setActiveTab("useMesh")}
                className={`flex-1 py-2 text-[11px] font-bold transition-all ${
                  activeTab === "useMesh" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                Use Mesh
              </button>
            </div>

            {activeTab === "extract" ? (
              <>
                {/* Upload zone */}
                <div className="space-y-2">
                  <SectionLabel>Source Video</SectionLabel>
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
                          <p className="text-[10px] text-slate-400 mt-0.5">MP4 · Max 8 seconds</p>
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

                {/* Media library */}
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
                            onClick={async () => {
                              setSelectedVideoUrl(vid.url);
                              try { setVideoDimensions(await getVideoDimensions(vid.url)); } catch { /* fallback */ }
                              onVideoSelect?.(vid.url, null, "Source Video", "");
                            }}
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

                {/* Settings (collapsible) */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowExtractSettings(v => !v)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showExtractSettings ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    Settings
                  </button>
                  {showExtractSettings && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-[11px] font-bold text-slate-700">Seed</p>
                          <p className="text-[9px] text-slate-400">For reproducible results</p>
                        </div>
                        <input
                          type="number"
                          value={extractionSeed}
                          onChange={e => setExtractionSeed(parseInt(e.target.value) || 0)}
                          className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Use Mesh tab */
              <>
                <div className="space-y-2">
                  <SectionLabel>Blue Mesh Video</SectionLabel>

                  {selectedMeshUrl ? (
                    <div className="relative aspect-video rounded-xl overflow-hidden border-2 border-blue-300 bg-black">
                      <video src={selectedMeshUrl + "#t=0.5"} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                      <button
                        onClick={() => { setSelectedMeshGcsUri(null); setSelectedMeshUrl(null); setSelectedMeshSourceVideoUrl(null); }}
                        className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                      >
                        <X size={12} />
                      </button>
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-md">Mesh Selected</div>
                    </div>
                  ) : (
                    <div
                      onClick={() => !isUploadingMesh && meshFileInputRef.current?.click()}
                      className={`relative aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors
                        ${isUploadingMesh ? "border-blue-300 bg-blue-50 cursor-not-allowed" :
                          "border-blue-200 bg-blue-50/30 hover:bg-blue-50 hover:border-blue-300 cursor-pointer"}`}
                    >
                      {isUploadingMesh ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 size={28} className="text-blue-500 animate-spin" />
                          <p className="text-xs font-bold text-slate-600">{Math.round(meshUploadProgress)}% Uploading…</p>
                        </div>
                      ) : (
                        <>
                          <div className="p-3 bg-white rounded-lg shadow-sm border border-blue-100 text-blue-400">
                            <Upload size={22} />
                          </div>
                          <div className="text-center px-4">
                            <p className="text-sm font-bold text-slate-600">Upload a blue mesh video</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">MP4 mesh file</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {meshUploadError && (
                    <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
                      <AlertCircle size={13} /> {meshUploadError}
                    </div>
                  )}
                  <input ref={meshFileInputRef} type="file" accept="video/*" className="hidden" onChange={handleMeshUpload} />
                </div>

                {/* Mesh Library */}
                {!selectedMeshUrl && (
                  <div className="space-y-2">
                    <SectionLabel>Mesh Library</SectionLabel>
                    {loadingMeshes ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={18} className="text-slate-300 animate-spin" />
                      </div>
                    ) : meshes.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-6">No meshes yet — extract or upload one</p>
                    ) : (
                      <div className="space-y-2">
                        {meshes.map(mesh => (
                          <div
                            key={mesh.id}
                            onClick={async () => {
                              setSelectedMeshGcsUri(mesh.gcsUri);
                              setSelectedMeshUrl(mesh.url);
                              setSelectedMeshSourceVideoUrl(mesh.sourceVideoUrl || null);
                              const dimSource = mesh.sourceVideoUrl || mesh.url;
                              try { setVideoDimensions(await getVideoDimensions(dimSource)); } catch { /* fallback */ }
                            }}
                            className="flex items-stretch gap-0 rounded-xl overflow-hidden border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-all group active:scale-[0.98] bg-black"
                            title={mesh.name}
                          >
                            {/* Source video (left) */}
                            {mesh.sourceVideoUrl ? (
                              <div className="relative w-1/2 aspect-video shrink-0">
                                <video
                                  src={mesh.sourceVideoUrl + "#t=0.5"}
                                  className="w-full h-full object-cover"
                                  preload="metadata"
                                  muted
                                  playsInline
                                />
                                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[8px] font-bold rounded">
                                  Source
                                </div>
                              </div>
                            ) : null}
                            {/* Mesh video (right or full width) */}
                            <div className={`relative ${mesh.sourceVideoUrl ? "w-1/2" : "w-full"} aspect-video shrink-0`}>
                              <video
                                src={mesh.url + "#t=0.5"}
                                className="w-full h-full object-cover"
                                preload="metadata"
                                muted
                                playsInline
                                onMouseEnter={e => e.currentTarget.play()}
                                onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0.5; }}
                              />
                              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500/80 text-white text-[8px] font-bold rounded">
                                Mesh
                              </div>
                              <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/20 transition-colors" />
                            </div>
                            {/* Arrow overlay between the two */}
                            {mesh.sourceVideoUrl && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                                  <ArrowRight size={10} className="text-white" />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => meshFileInputRef.current?.click()}
                      className="w-full py-2 border border-dashed border-blue-300 rounded-lg text-[11px] font-semibold text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Upload size={12} /> Upload mesh video
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          /* Step 2: Generate */
          <>
            {/* Mesh source card (read-only) */}
            <div className="space-y-2">
              <SectionLabel>Motion Source</SectionLabel>
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 overflow-hidden">
                {/* Source → Mesh paired preview */}
                <div className="flex">
                  {selectedMeshSourceVideoUrl && (
                    <div className="relative w-1/2 aspect-video bg-black">
                      <video src={selectedMeshSourceVideoUrl + "#t=0.5"} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[8px] font-bold rounded">Source</div>
                    </div>
                  )}
                  {selectedMeshUrl && (
                    <div className={`relative ${selectedMeshSourceVideoUrl ? "w-1/2" : "w-full"} aspect-video bg-black`}>
                      <video src={selectedMeshUrl + "#t=0.5"} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500/80 text-white text-[8px] font-bold rounded">Mesh</div>
                    </div>
                  )}
                  {selectedMeshSourceVideoUrl && (
                    <div className="absolute inset-x-0 top-0 h-[calc(50%+1rem)] flex items-center justify-center pointer-events-none">
                      <div className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                        <ArrowRight size={10} className="text-white" />
                      </div>
                    </div>
                  )}
                </div>
                {/* Info bar */}
                <div className="flex items-center gap-2 px-2.5 py-2 border-t border-blue-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-700 truncate">
                      {selectedMeshSourceVideoUrl ? "Source → Blue Mesh" : "Blue Mesh"}
                    </p>
                    <p className="text-[9px] text-slate-400">Ready for generation{videoDimensions ? ` · ${videoDimensions.width}×${videoDimensions.height}` : ""}</p>
                  </div>
                  <button
                    onClick={() => { setCurrentStep(1); }}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-0.5 shrink-0"
                  >
                    <ArrowLeft size={10} /> Change
                  </button>
                </div>
              </div>
            </div>

            {/* Character Image (required) */}
            <div className="space-y-2">
              <SectionLabel>Character Image <span className="text-red-400">*</span></SectionLabel>
              <div
                onClick={() => !isUploadingImage && !characterImageUrl && imageFileInputRef.current?.click()}
                className={`relative rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-colors overflow-hidden
                  ${isUploadingImage ? "h-32 border-blue-300 bg-blue-50 cursor-not-allowed" :
                    characterImageUrl ? "border-slate-200 p-0 cursor-default" :
                    "h-32 border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 cursor-pointer"}`}
              >
                {isUploadingImage ? (
                  <Loader2 size={20} className="text-blue-500 animate-spin" />
                ) : characterImageUrl ? (
                  <>
                    <img src={characterImageUrl} alt="Character" className="w-full rounded-xl" style={{ maxHeight: "280px", objectFit: "contain" }} />
                    <button
                      onClick={e => { e.stopPropagation(); setCharacterImageUrl(null); setCharacterImageGcsUri(null); }}
                      className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                    >
                      <X size={12} />
                    </button>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-md">Character</div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400">
                    <ImageIcon size={16} />
                    <div className="text-center">
                      <span className="text-[11px] font-semibold text-slate-500">Upload character image (PNG or JPEG)</span>
                      {videoDimensions && (
                        <p className="text-[9px] text-slate-400 mt-0.5">Will be resized to {videoDimensions.width}×{videoDimensions.height}px</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {imageUploadError && (
                <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
                  <AlertCircle size={13} /> {imageUploadError}
                </div>
              )}
              <input ref={imageFileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleImageUpload} />

              {/* Character Library */}
              {!characterImageUrl && (
                <div className="space-y-2">
                  {loadingCharacters ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={14} className="text-slate-300 animate-spin" />
                    </div>
                  ) : characters.length > 0 ? (
                    <>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Previously Used</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {characters.map(ch => (
                          <div
                            key={ch.id}
                            onClick={() => {
                              setCharacterImageUrl(ch.url);
                              setCharacterImageGcsUri(ch.gcsUri);
                              setCharacterImageMimeType(ch.mimeType || "image/png");
                            }}
                            className="relative rounded-lg overflow-hidden border-2 border-slate-200 hover:border-blue-400 cursor-pointer transition-all group active:scale-95 bg-slate-100"
                            title={ch.name}
                          >
                            <img
                              src={ch.url}
                              alt={ch.name}
                              className="w-full aspect-square object-cover"
                            />
                            <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/20 transition-colors" />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <SectionLabel>Prompt <span className="text-slate-400 normal-case font-normal">(optional)</span></SectionLabel>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the character style…"
                className="w-full h-20 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Output Settings */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <SectionLabel>Output Settings</SectionLabel>
              <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">

                {/* Seed */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-700">Seed</p>
                    <p className="text-[9px] text-slate-400">For reproducible results</p>
                  </div>
                  <input
                    type="number"
                    value={generationSeed}
                    onChange={e => setGenerationSeed(parseInt(e.target.value) || 0)}
                    className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                </div>

                {/* Compression */}
                <div className="px-3 py-2.5 space-y-2">
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">Compression</p>
                    <p className="text-[9px] text-slate-400">
                      {compressionQuality === "optimized" ? "Smaller file, great quality" : "Full quality, larger file"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {(["optimized", "lossless"] as const).map(q => (
                      <button
                        key={q}
                        onClick={() => setCompressionQuality(q)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          compressionQuality === q
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                        }`}
                      >
                        {q === "optimized" ? "Optimized" : "Lossless"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Submit bar */}
      <div className="p-4 pb-16 border-t border-slate-100 bg-slate-50 shrink-0 space-y-3">
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

        {currentStep === 1 && activeTab === "extract" ? (
          <>
            <button
              onClick={handleExtractSubmit}
              disabled={!selectedVideoUrl || submitting}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Submitting…</>
              ) : (
                <><Drama size={16} /> Extract Motion Mesh</>
              )}
            </button>
            {!selectedVideoUrl && (
              <p className="text-[10px] text-slate-400 text-center">Select a video above to begin extraction</p>
            )}
          </>
        ) : currentStep === 1 && activeTab === "useMesh" ? (
          <>
            <button
              onClick={handleContinueToStep2}
              disabled={!selectedMeshGcsUri}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <ArrowRight size={16} /> Continue to Step 2
            </button>
            {!selectedMeshGcsUri && (
              <p className="text-[10px] text-slate-400 text-center">Select or upload a mesh video above</p>
            )}
          </>
        ) : (
          <>
            <button
              onClick={handleGenerateSubmit}
              disabled={!selectedMeshGcsUri || !characterImageGcsUri || submitting}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Submitting…</>
              ) : (
                <><Drama size={16} /> Generate Performance Video</>
              )}
            </button>
            {!characterImageGcsUri && (
              <p className="text-[10px] text-slate-400 text-center">Upload a character image to generate</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PerformancePanel;
