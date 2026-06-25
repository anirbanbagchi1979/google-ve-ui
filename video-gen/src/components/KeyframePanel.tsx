"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  GalleryHorizontalEnd,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Image as ImageIcon,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { storage } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { getGcsUri } from "@/utils/gcs";
import { buildKeyframeGenerationPayload } from "@/utils/payload";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { STORAGE_PATHS, DEFAULTS } from "@/constants";

interface KeyframePanelProps {
  onGenerate?: (payload: any, isLongRunning: boolean) => void;
}

interface ConditioningFrame {
  id: string;
  url: string | null;
  gcsUri: string | null;
  mimeType: string;
  frameNum: number;
  uploading: boolean;
  progress: number;
  error: string | null;
}

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];
const VALID_FRAME_NUMS = Array.from({ length: 23 }, (_, i) => (i + 1) * 8); // 8, 16, 24, ..., 184

const KeyframePanel = ({ onGenerate }: KeyframePanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();

  // Prompt
  const [prompt, setPrompt] = useState("");

  // Start frame (required)
  const startFrameRef = useRef<HTMLInputElement>(null);
  const [startFrameUrl, setStartFrameUrl] = useState<string | null>(null);
  const [startFrameGcsUri, setStartFrameGcsUri] = useState<string | null>(null);
  const [startFrameMimeType, setStartFrameMimeType] = useState<string>("image/png");
  const [isUploadingStart, setIsUploadingStart] = useState(false);
  const [startUploadProgress, setStartUploadProgress] = useState(0);
  const [startUploadError, setStartUploadError] = useState<string | null>(null);

  // Last frame (optional)
  const lastFrameRef = useRef<HTMLInputElement>(null);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const [lastFrameGcsUri, setLastFrameGcsUri] = useState<string | null>(null);
  const [lastFrameMimeType, setLastFrameMimeType] = useState<string>("image/png");
  const [isUploadingLast, setIsUploadingLast] = useState(false);
  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);

  // Conditioning frames
  const [conditioningFrames, setConditioningFrames] = useState<ConditioningFrame[]>([]);
  const conditioningRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Settings
  const [seed, setSeed] = useState<number>(DEFAULTS.SEED);
  const [sharpness, setSharpness] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- Generic image upload helper ---
  const uploadImage = (
    file: File,
    setUrl: (v: string | null) => void,
    setGcsUri: (v: string | null) => void,
    setMime: (v: string) => void,
    setUploading: (v: boolean) => void,
    setProgress: (v: number) => void,
    setError: (v: string | null) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Please select a PNG or JPEG image.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setError(null);

    const storageRef = ref(storage, `${STORAGE_PATHS.IMAGES}/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap: { bytesTransferred: number; totalBytes: number }) => setProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      (err: Error) => { setError("Upload failed: " + err.message); setUploading(false); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const gcsUri = getGcsUri(url);
          setUrl(url);
          setGcsUri(gcsUri);
          setMime(file.type === "image/png" ? "image/png" : "image/jpeg");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to upload.");
        } finally {
          setUploading(false);
          if (inputRef.current) inputRef.current.value = "";
        }
      }
    );
  };

  // --- Conditioning frame management ---
  const usedFrameNums = new Set(conditioningFrames.map(cf => cf.frameNum));
  const availableFrameNums = VALID_FRAME_NUMS.filter(n => !usedFrameNums.has(n));

  const addConditioningFrame = () => {
    if (availableFrameNums.length === 0) return;
    const id = Math.random().toString(36).substring(2, 9);
    setConditioningFrames(prev => [...prev, {
      id,
      url: null,
      gcsUri: null,
      mimeType: "image/png",
      frameNum: availableFrameNums[0],
      uploading: false,
      progress: 0,
      error: null,
    }]);
  };

  const removeConditioningFrame = (id: string) => {
    setConditioningFrames(prev => prev.filter(cf => cf.id !== id));
  };

  const updateConditioningFrame = (id: string, updates: Partial<ConditioningFrame>) => {
    setConditioningFrames(prev => prev.map(cf => cf.id === id ? { ...cf, ...updates } : cf));
  };

  const handleConditioningUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      updateConditioningFrame(id, { error: "Please select a PNG or JPEG image." });
      return;
    }

    updateConditioningFrame(id, { uploading: true, progress: 0, error: null });

    const storageRef = ref(storage, `${STORAGE_PATHS.IMAGES}/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap: { bytesTransferred: number; totalBytes: number }) => {
        updateConditioningFrame(id, { progress: (snap.bytesTransferred / snap.totalBytes) * 100 });
      },
      (err: Error) => {
        updateConditioningFrame(id, { uploading: false, error: "Upload failed: " + err.message });
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const gcsUri = getGcsUri(url);
          updateConditioningFrame(id, {
            url, gcsUri,
            mimeType: file.type === "image/png" ? "image/png" : "image/jpeg",
            uploading: false,
          });
        } catch (err) {
          updateConditioningFrame(id, { uploading: false, error: "Failed to upload." });
        }
        const inputEl = conditioningRefs.current[id];
        if (inputEl) inputEl.value = "";
      }
    );
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!startFrameGcsUri || !prompt.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setConfirmed(false);

    try {
      const validFrames = conditioningFrames.filter(cf => cf.gcsUri);
      const payload = buildKeyframeGenerationPayload(
        prompt.trim(),
        startFrameGcsUri,
        startFrameMimeType,
        config,
        {
          lastFrameGcsUri: lastFrameGcsUri || undefined,
          lastFrameMimeType: lastFrameGcsUri ? lastFrameMimeType : undefined,
          conditioningFrames: validFrames.map(cf => ({
            gcsUri: cf.gcsUri!,
            mimeType: cf.mimeType,
            frameNum: cf.frameNum,
          })),
          seed,
          sharpness,
        }
      );
      (payload as any)._startFrameUrl = startFrameUrl;
      (payload as any)._lastFrameUrl = lastFrameUrl;
      (payload as any)._conditioningFrameUrls = validFrames.map(cf => ({ url: cf.url, frameNum: cf.frameNum }));
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

  const canSubmit = !!startFrameGcsUri && !!prompt.trim();

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <PanelHeader
        icon={<GalleryHorizontalEnd size={13} />}
        title="Multi-Keyframe"
        subtitle="Interpolate between conditioning frames"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Start Frame (required) */}
        <div className="space-y-2">
          <SectionLabel>Start Frame <span className="text-red-400">*</span></SectionLabel>
          <p className="text-[10px] text-slate-400">First frame of the output video. PNG or JPEG.</p>
          <div
            onClick={() => !isUploadingStart && !startFrameUrl && startFrameRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-colors overflow-hidden
              ${isUploadingStart ? "h-36 border-blue-300 bg-blue-50 cursor-not-allowed" :
                startFrameUrl ? "border-slate-200 p-0 cursor-default" :
                "h-36 border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 cursor-pointer"}`}
          >
            {isUploadingStart ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="text-blue-500 animate-spin" />
                <p className="text-xs font-bold text-slate-600">{Math.round(startUploadProgress)}%</p>
              </div>
            ) : startFrameUrl ? (
              <>
                <img src={startFrameUrl} alt="Start frame" className="w-full rounded-xl" style={{ maxHeight: "240px", objectFit: "contain" }} />
                <button onClick={(e) => { e.stopPropagation(); setStartFrameUrl(null); setStartFrameGcsUri(null); }}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
                  <X size={12} />
                </button>
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-md">Frame 0 (Start)</div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <div className="p-3 bg-white rounded-lg shadow-sm border border-slate-100"><ImageIcon size={20} /></div>
                <p className="text-sm font-bold text-slate-600">Upload start frame</p>
              </div>
            )}
          </div>
          {startUploadError && (
            <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> {startUploadError}
            </div>
          )}
          <input ref={startFrameRef} type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, setStartFrameUrl, setStartFrameGcsUri, setStartFrameMimeType, setIsUploadingStart, setStartUploadProgress, setStartUploadError, startFrameRef); }} />
        </div>

        {/* Conditioning Frames */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Conditioning Frames <span className="text-slate-400 normal-case font-normal">(optional)</span></SectionLabel>
            <span className="text-[9px] text-slate-400 font-mono">{conditioningFrames.length} added</span>
          </div>
          <p className="text-[10px] text-slate-400">Intermediate keyframes at multiples of 8 (8-184). The model interpolates smoothly between them.</p>

          {conditioningFrames.length > 0 && (
            <div className="space-y-2">
              {conditioningFrames.map((cf) => (
                <div key={cf.id} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    {/* Frame number selector */}
                    <select
                      value={cf.frameNum}
                      onChange={(e) => updateConditioningFrame(cf.id, { frameNum: parseInt(e.target.value) })}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value={cf.frameNum}>Frame {cf.frameNum}</option>
                      {availableFrameNums.map(n => (
                        <option key={n} value={n}>Frame {n}</option>
                      ))}
                    </select>

                    {/* Image preview / upload */}
                    <div className="flex-1 min-w-0">
                      {cf.uploading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 size={14} className="text-blue-500 animate-spin" />
                          <span className="text-[10px] text-slate-500">{Math.round(cf.progress)}%</span>
                        </div>
                      ) : cf.url ? (
                        <div className="flex items-center gap-2">
                          <img src={cf.url} alt={`Frame ${cf.frameNum}`} className="h-10 w-16 object-cover rounded border border-slate-200" />
                          <button onClick={() => updateConditioningFrame(cf.id, { url: null, gcsUri: null })}
                            className="text-[9px] text-red-400 hover:text-red-600 font-semibold">Replace</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => conditioningRefs.current[cf.id]?.click()}
                          className="text-[10px] font-semibold text-blue-500 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Upload size={10} /> Upload image
                        </button>
                      )}
                    </div>

                    {/* Remove button */}
                    <button onClick={() => removeConditioningFrame(cf.id)}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {cf.error && (
                    <div className="px-3 pb-2">
                      <div className="flex items-center gap-1 text-red-500 text-[9px]">
                        <AlertCircle size={10} /> {cf.error}
                      </div>
                    </div>
                  )}
                  <input
                    ref={(el) => { conditioningRefs.current[cf.id] = el; }}
                    type="file" accept="image/png,image/jpeg" className="hidden"
                    onChange={(e) => handleConditioningUpload(cf.id, e)} />
                </div>
              ))}
            </div>
          )}

          {availableFrameNums.length > 0 && (
            <button
              onClick={addConditioningFrame}
              className="w-full py-2 border border-dashed border-blue-300 rounded-lg text-[11px] font-semibold text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus size={12} /> Add conditioning frame
            </button>
          )}
        </div>

        {/* Last Frame (optional) */}
        <div className="space-y-2">
          <SectionLabel>Last Frame <span className="text-slate-400 normal-case font-normal">(optional)</span></SectionLabel>
          <p className="text-[10px] text-slate-400">Last frame of the output video.</p>
          <div
            onClick={() => !isUploadingLast && !lastFrameUrl && lastFrameRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-colors overflow-hidden
              ${isUploadingLast ? "h-24 border-emerald-300 bg-emerald-50 cursor-not-allowed" :
                lastFrameUrl ? "border-emerald-200 p-0 cursor-default" :
                "h-24 border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer"}`}
          >
            {isUploadingLast ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={20} className="text-emerald-500 animate-spin" />
                <p className="text-xs font-bold text-slate-600">{Math.round(lastUploadProgress)}%</p>
              </div>
            ) : lastFrameUrl ? (
              <>
                <img src={lastFrameUrl} alt="Last frame" className="w-full rounded-xl" style={{ maxHeight: "180px", objectFit: "contain" }} />
                <button onClick={(e) => { e.stopPropagation(); setLastFrameUrl(null); setLastFrameGcsUri(null); }}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
                  <X size={12} />
                </button>
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded-md">Last Frame</div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-slate-400">
                <ImageIcon size={16} />
                <span className="text-[11px] font-semibold text-slate-500">Upload last frame (optional)</span>
              </div>
            )}
          </div>
          {lastUploadError && (
            <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> {lastUploadError}
            </div>
          )}
          <input ref={lastFrameRef} type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, setLastFrameUrl, setLastFrameGcsUri, setLastFrameMimeType, setIsUploadingLast, setLastUploadProgress, setLastUploadError, lastFrameRef); }} />
        </div>

        {/* Prompt (required) */}
        <div className="space-y-2">
          <SectionLabel>Prompt <span className="text-red-400">*</span></SectionLabel>
          <p className="text-[10px] text-slate-400">Describe the video. Include details about the keyframes for best coherence.</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A cinematic shot with coherent motion from the start image, through the mid frames, to the end image..."
            className="w-full h-28 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Settings */}
        <div className="space-y-2">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showSettings ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            Settings
          </button>
          {showSettings && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-slate-700">Seed</p>
                  <p className="text-[9px] text-slate-400">For reproducible results</p>
                </div>
                <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
              </div>
              <div className="px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">Sharpness</p>
                    <p className="text-[9px] text-slate-400">0 (softest) to 4 (sharpest)</p>
                  </div>
                  <span className="text-sm font-mono font-bold text-blue-600 tabular-nums">{sharpness}</span>
                </div>
                <input type="range" min={0} max={4} step={1} value={sharpness}
                  onChange={(e) => setSharpness(parseInt(e.target.value))} className="w-full accent-blue-600" />
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-bold text-blue-700">How It Works</p>
          <ul className="text-[9px] text-blue-600 space-y-0.5 list-disc list-inside">
            <li>The model generates 192 frames (8s at 24fps) interpolating between your keyframes</li>
            <li>Conditioning frames must be at multiples of 8 (8, 16, 24, ... 184)</li>
            <li>Describe the scene and motion in the prompt for best coherence</li>
            <li>Use descriptive prompts, not instructive ones</li>
          </ul>
        </div>
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
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.97] transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> Submitting...</>
          ) : (
            <><GalleryHorizontalEnd size={16} /> Generate Keyframe Video</>
          )}
        </button>
        {!canSubmit && (
          <p className="text-[10px] text-slate-400 text-center">
            {!startFrameGcsUri ? "Upload a start frame" : "Enter a text prompt"} to generate
          </p>
        )}
      </div>
    </div>
  );
};

export default KeyframePanel;
