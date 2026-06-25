"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  Grid3x3,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Repeat,
  ArrowLeftRight,
  ArrowUpDown,
} from "lucide-react";
import { storage } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { getGcsUri } from "@/utils/gcs";
import { buildTextureGenerationPayload } from "@/utils/payload";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { STORAGE_PATHS, DEFAULTS } from "@/constants";

interface TexturesPanelProps {
  onGenerate?: (payload: any, isLongRunning: boolean) => void;
}

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];

const TexturesPanel = ({ onGenerate }: TexturesPanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();

  // Mode: T2V (text only) or I2V (with image)
  const [mode, setMode] = useState<"t2v" | "i2v">("t2v");

  // Prompt
  const [prompt, setPrompt] = useState("");

  // Seamless options
  const [loop, setLoop] = useState(true);
  const [tessellateH, setTessellateH] = useState(true);
  const [tessellateV, setTessellateV] = useState(true);

  // Start frame image (I2V)
  const startFrameRef = useRef<HTMLInputElement>(null);
  const [startFrameUrl, setStartFrameUrl] = useState<string | null>(null);
  const [startFrameGcsUri, setStartFrameGcsUri] = useState<string | null>(null);
  const [startFrameMimeType, setStartFrameMimeType] = useState<string>("image/png");
  const [isUploadingStart, setIsUploadingStart] = useState(false);
  const [startUploadProgress, setStartUploadProgress] = useState(0);
  const [startUploadError, setStartUploadError] = useState<string | null>(null);

  // Last frame image (I2V, optional)
  const lastFrameRef = useRef<HTMLInputElement>(null);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const [lastFrameGcsUri, setLastFrameGcsUri] = useState<string | null>(null);
  const [lastFrameMimeType, setLastFrameMimeType] = useState<string>("image/png");
  const [isUploadingLast, setIsUploadingLast] = useState(false);
  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);

  // Settings
  const [seed, setSeed] = useState<number>(DEFAULTS.SEED);
  const [sharpness, setSharpness] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- Image upload helper ---
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setUrl: (v: string | null) => void,
    setGcsUri: (v: string | null) => void,
    setMime: (v: string) => void,
    setUploading: (v: boolean) => void,
    setProgress: (v: number) => void,
    setError: (v: string | null) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      (err: Error) => {
        setError("Upload failed: " + err.message);
        setUploading(false);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const gcsUri = getGcsUri(url);
          const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
          setUrl(url);
          setGcsUri(gcsUri);
          setMime(mimeType);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to upload image.");
        } finally {
          setUploading(false);
          if (inputRef.current) inputRef.current.value = "";
        }
      }
    );
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!prompt.trim() && mode === "t2v") return;
    if (mode === "i2v" && !startFrameGcsUri) return;
    if (!loop && !tessellateH && !tessellateV) return;

    setSubmitting(true);
    setSubmitError(null);
    setConfirmed(false);

    try {
      const payload = buildTextureGenerationPayload(
        prompt.trim(),
        config,
        {
          loop,
          tessellateHorizontal: tessellateH,
          tessellateVertical: tessellateV,
          imageGcsUri: mode === "i2v" ? (startFrameGcsUri || undefined) : undefined,
          imageMimeType: mode === "i2v" ? startFrameMimeType : undefined,
          lastFrameGcsUri: mode === "i2v" ? (lastFrameGcsUri || undefined) : undefined,
          lastFrameMimeType: mode === "i2v" ? lastFrameMimeType : undefined,
          seed,
          sharpness,
        }
      );
      // Attach metadata
      (payload as any)._startFrameUrl = startFrameUrl;
      (payload as any)._lastFrameUrl = lastFrameUrl;
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

  const atLeastOneSeamless = loop || tessellateH || tessellateV;
  const canSubmit = prompt.trim().length > 0 && atLeastOneSeamless && (mode === "t2v" || !!startFrameGcsUri);

  // Looping + image conditioning warning
  const loopWithImageWarning = mode === "i2v" && loop;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <PanelHeader
        icon={<Grid3x3 size={13} />}
        title="Video Textures"
        subtitle="Tessellation & looping for seamless video"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Mode toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setMode("t2v")}
            className={`flex-1 py-2 text-[11px] font-bold transition-all ${
              mode === "t2v" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            Text to Video
          </button>
          <button
            onClick={() => setMode("i2v")}
            className={`flex-1 py-2 text-[11px] font-bold transition-all ${
              mode === "i2v" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            Image to Video
          </button>
        </div>

        {/* Seamless Options */}
        <div className="space-y-2">
          <SectionLabel>Seamless Mode <span className="text-red-400">*</span></SectionLabel>
          <p className="text-[10px] text-slate-400">Enable at least one option. Combine for fully seamless tiles.</p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
            {/* Loop */}
            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 accent-blue-600"
              />
              <Repeat size={14} className="text-blue-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] font-bold text-slate-700">Temporal Loop</p>
                <p className="text-[9px] text-slate-400">Seamless infinite playback loop</p>
              </div>
            </label>

            {/* Tessellate Horizontal */}
            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={tessellateH}
                onChange={(e) => setTessellateH(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 accent-blue-600"
              />
              <ArrowLeftRight size={14} className="text-blue-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] font-bold text-slate-700">Tessellate Horizontal</p>
                <p className="text-[9px] text-slate-400">Tiles seamlessly left-to-right</p>
              </div>
            </label>

            {/* Tessellate Vertical */}
            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={tessellateV}
                onChange={(e) => setTessellateV(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 accent-blue-600"
              />
              <ArrowUpDown size={14} className="text-blue-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] font-bold text-slate-700">Tessellate Vertical</p>
                <p className="text-[9px] text-slate-400">Tiles seamlessly top-to-bottom</p>
              </div>
            </label>
          </div>

          {!atLeastOneSeamless && (
            <div className="flex items-center gap-1.5 text-amber-500 text-[10px] font-medium bg-amber-50 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> Enable at least one seamless option
            </div>
          )}
        </div>

        {/* Prompt */}
        <div className="space-y-2">
          <SectionLabel>Prompt <span className="text-red-400">*</span></SectionLabel>
          <p className="text-[10px] text-slate-400">Describe patterns, textures, or organic visuals. Avoid discrete objects.</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Orthographic macro of thick car wash foam pressed flat against glass..."
            className="w-full h-28 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* I2V: Start Frame */}
        {mode === "i2v" && (
          <>
            <div className="space-y-2">
              <SectionLabel>Start Frame <span className="text-red-400">*</span></SectionLabel>
              <p className="text-[10px] text-slate-400">PNG or JPEG. For tessellation, best results with a prior tessellated frame.</p>
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
                    <p className="text-xs font-bold text-slate-600">{Math.round(startUploadProgress)}% Uploading...</p>
                  </div>
                ) : startFrameUrl ? (
                  <>
                    <img src={startFrameUrl} alt="Start frame" className="w-full rounded-xl" style={{ maxHeight: "240px", objectFit: "contain" }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); setStartFrameUrl(null); setStartFrameGcsUri(null); }}
                      className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                    >
                      <X size={12} />
                    </button>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-md">Start Frame</div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-slate-100">
                      <ImageIcon size={20} />
                    </div>
                    <div className="text-center px-4">
                      <p className="text-sm font-bold text-slate-600">Upload start frame</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">PNG or JPEG</p>
                    </div>
                  </div>
                )}
              </div>
              {startUploadError && (
                <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
                  <AlertCircle size={13} /> {startUploadError}
                </div>
              )}
              <input ref={startFrameRef} type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={(e) => handleImageUpload(e, setStartFrameUrl, setStartFrameGcsUri, setStartFrameMimeType, setIsUploadingStart, setStartUploadProgress, setStartUploadError, startFrameRef)} />
            </div>

            {/* I2V: Last Frame (optional) */}
            <div className="space-y-2">
              <SectionLabel>Last Frame <span className="text-slate-400 normal-case font-normal">(optional)</span></SectionLabel>
              <p className="text-[10px] text-slate-400">Conditioned frame is 8th-to-last in output (known limitation).</p>
              <div
                onClick={() => !isUploadingLast && !lastFrameUrl && lastFrameRef.current?.click()}
                className={`relative rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-colors overflow-hidden
                  ${isUploadingLast ? "h-28 border-emerald-300 bg-emerald-50 cursor-not-allowed" :
                    lastFrameUrl ? "border-emerald-200 p-0 cursor-default" :
                    "h-28 border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer"}`}
              >
                {isUploadingLast ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={24} className="text-emerald-500 animate-spin" />
                    <p className="text-xs font-bold text-slate-600">{Math.round(lastUploadProgress)}% Uploading...</p>
                  </div>
                ) : lastFrameUrl ? (
                  <>
                    <img src={lastFrameUrl} alt="Last frame" className="w-full rounded-xl" style={{ maxHeight: "200px", objectFit: "contain" }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); setLastFrameUrl(null); setLastFrameGcsUri(null); }}
                      className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                    >
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
                onChange={(e) => handleImageUpload(e, setLastFrameUrl, setLastFrameGcsUri, setLastFrameMimeType, setIsUploadingLast, setLastUploadProgress, setLastUploadError, lastFrameRef)} />
            </div>
          </>
        )}

        {/* Warnings */}
        {loopWithImageWarning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-bold text-amber-700">Warning</p>
            <p className="text-[9px] text-amber-600">Looping with image conditioning is not supported and may produce unpredictable results. Consider disabling loop, or set both start and last frame to the same image.</p>
          </div>
        )}

        {/* Settings (collapsible) */}
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
              {/* Seed */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-slate-700">Seed</p>
                  <p className="text-[9px] text-slate-400">For reproducible results</p>
                </div>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                />
              </div>

              {/* Sharpness */}
              <div className="px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">Sharpness</p>
                    <p className="text-[9px] text-slate-400">0 (softest) to 4 (sharpest). Default: 1</p>
                  </div>
                  <span className="text-sm font-mono font-bold text-blue-600 tabular-nums">{sharpness}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={sharpness}
                  onChange={(e) => setSharpness(parseInt(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[8px] text-slate-400 px-0.5">
                  <span>Soft</span>
                  <span>Sharp</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-bold text-blue-700">Tips for Best Results</p>
          <ul className="text-[9px] text-blue-600 space-y-0.5 list-disc list-inside">
            <li>Describe continuous patterns: water, clouds, fire, foliage, abstract textures</li>
            <li>Avoid discrete objects or characters that look unnatural when tiled</li>
            <li>Use looping for ambient content, signage, screensavers</li>
            <li>For I2V tessellation, use a prior tessellated frame as input</li>
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
            <><Grid3x3 size={16} /> Generate Texture Video</>
          )}
        </button>
        {!canSubmit && (
          <p className="text-[10px] text-slate-400 text-center">
            {!atLeastOneSeamless ? "Enable at least one seamless option" :
             !prompt.trim() ? "Enter a text prompt" :
             mode === "i2v" && !startFrameGcsUri ? "Upload a start frame image" :
             ""}
          </p>
        )}
      </div>
    </div>
  );
};

export default TexturesPanel;
