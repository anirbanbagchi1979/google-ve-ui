"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  Mic,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { storage, db } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useConfig } from "@/context/ConfigContext";
import { useProject } from "@/context/ProjectContext";
import { getGcsUri } from "@/utils/gcs";
import { buildA2VGenerationPayload } from "@/utils/payload";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { COLLECTIONS, STORAGE_PATHS } from "@/constants";

interface DialoguePanelProps {
  onGenerate?: (payload: any, isLongRunning: boolean) => void;
}

const ACCEPTED_AUDIO_TYPES = ["audio/wav", "audio/mp3", "audio/mpeg", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/aac", "audio/x-m4a"];
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];

/** Map browser-reported MIME type to the API's expected MIME type */
const normalizeAudioMimeType = (type: string): string => {
  if (type === "audio/wav" || type === "audio/x-wav") return "audio/wav";
  if (type === "audio/mp3") return "audio/mp3";
  return "audio/mpeg";
};

const DialoguePanel = ({ onGenerate }: DialoguePanelProps) => {
  const { config } = useConfig();
  const { currentProjectId } = useProject();

  // Image state
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageGcsUri, setImageGcsUri] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/png");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // Audio state
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioGcsUri, setAudioGcsUri] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>("audio/wav");
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);

  // Prompt
  const [prompt, setPrompt] = useState("");

  // Settings
  const [sharpness, setSharpness] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- Image upload ---
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageUploadError("Please select a PNG or JPEG image.");
      return;
    }

    setIsUploadingImage(true);
    setImageUploadProgress(0);
    setImageUploadError(null);

    const storageRef = ref(storage, `${STORAGE_PATHS.IMAGES}/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snap) => setImageUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      (err) => {
        setImageUploadError("Upload failed: " + err.message);
        setIsUploadingImage(false);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const gcsUri = getGcsUri(url);
          const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
          setImageUrl(url);
          setImageGcsUri(gcsUri);
          setImageMimeType(mimeType);
        } catch (err) {
          console.error("[DialoguePanel] Image upload failed:", err);
          setImageUploadError(err instanceof Error ? err.message : "Failed to upload image.");
        } finally {
          setIsUploadingImage(false);
          if (imageFileInputRef.current) imageFileInputRef.current.value = "";
        }
      }
    );
  };

  // --- Audio upload ---
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Accept common audio types
    const isAudio = file.type.startsWith("audio/") || ACCEPTED_AUDIO_TYPES.includes(file.type);
    if (!isAudio) {
      setAudioUploadError("Please select a WAV, MP3, M4A, or AAC audio file.");
      return;
    }

    setIsUploadingAudio(true);
    setAudioUploadProgress(0);
    setAudioUploadError(null);

    const storageRef = ref(storage, `${STORAGE_PATHS.AUDIO}/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snap) => setAudioUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      (err) => {
        setAudioUploadError("Upload failed: " + err.message);
        setIsUploadingAudio(false);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const gcsUri = getGcsUri(url);
          const mimeType = normalizeAudioMimeType(file.type);
          setAudioUrl(url);
          setAudioGcsUri(gcsUri);
          setAudioMimeType(mimeType);
          setAudioFileName(file.name);

          // Save to Firestore for reuse
          await addDoc(collection(db, COLLECTIONS.AUDIO_FILES), {
            name: file.name,
            url,
            gcsUri,
            mimeType,
            size: file.size,
            projectId: currentProjectId,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("[DialoguePanel] Audio upload failed:", err);
          setAudioUploadError(err instanceof Error ? err.message : "Failed to upload audio.");
        } finally {
          setIsUploadingAudio(false);
          if (audioFileInputRef.current) audioFileInputRef.current.value = "";
        }
      }
    );
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!imageGcsUri || !audioGcsUri || !prompt.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setConfirmed(false);

    try {
      const payload = buildA2VGenerationPayload(
        imageGcsUri,
        imageMimeType,
        audioGcsUri,
        audioMimeType,
        prompt.trim(),
        config,
        { sharpness }
      );
      // Attach metadata for tracking
      (payload as any)._imageUrl = imageUrl;
      (payload as any)._audioUrl = audioUrl;
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

  const canSubmit = !!imageGcsUri && !!audioGcsUri && !!prompt.trim();

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <PanelHeader
        icon={<Mic size={13} />}
        title="Dialogue Generation"
        subtitle="Audio-driven lip-sync video from a start frame"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Reference Image (required) */}
        <div className="space-y-2">
          <SectionLabel>Start Frame Image <span className="text-red-400">*</span></SectionLabel>
          <p className="text-[10px] text-slate-400">PNG or JPEG, ideally 1280x720. Character mouth must be visible.</p>
          <div
            onClick={() => !isUploadingImage && !imageUrl && imageFileInputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-colors overflow-hidden
              ${isUploadingImage ? "h-44 border-blue-300 bg-blue-50 cursor-not-allowed" :
                imageUrl ? "border-slate-200 p-0 cursor-default" :
                "h-44 border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 cursor-pointer"}`}
          >
            {isUploadingImage ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={28} className="text-blue-500 animate-spin" />
                <p className="text-xs font-bold text-slate-600">{Math.round(imageUploadProgress)}% Uploading...</p>
              </div>
            ) : imageUrl ? (
              <>
                <img src={imageUrl} alt="Start frame" className="w-full rounded-xl" style={{ maxHeight: "280px", objectFit: "contain" }} />
                <button
                  onClick={(e) => { e.stopPropagation(); setImageUrl(null); setImageGcsUri(null); }}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-md">Start Frame</div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <div className="p-3 bg-white rounded-lg shadow-sm border border-slate-100">
                  <ImageIcon size={22} />
                </div>
                <div className="text-center px-4">
                  <p className="text-sm font-bold text-slate-600">Upload start frame image</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">PNG or JPEG &middot; 1280x720 recommended</p>
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
        </div>

        {/* Audio File (required) */}
        <div className="space-y-2">
          <SectionLabel>Dialogue Audio <span className="text-red-400">*</span></SectionLabel>
          <p className="text-[10px] text-slate-400">WAV, MP3, M4A, or AAC. Must be 8 seconds (will be truncated/padded).</p>
          <div
            onClick={() => !isUploadingAudio && !audioUrl && audioFileInputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-colors overflow-hidden
              ${isUploadingAudio ? "h-24 border-violet-300 bg-violet-50 cursor-not-allowed" :
                audioUrl ? "border-violet-200 bg-violet-50/30 p-0 cursor-default" :
                "h-24 border-violet-200 bg-violet-50/30 hover:bg-violet-50 hover:border-violet-300 cursor-pointer"}`}
          >
            {isUploadingAudio ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="text-violet-500 animate-spin" />
                <p className="text-xs font-bold text-slate-600">{Math.round(audioUploadProgress)}% Uploading...</p>
              </div>
            ) : audioUrl ? (
              <div className="w-full px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                  <Mic size={18} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-slate-700 truncate">{audioFileName || "Audio file"}</p>
                  <p className="text-[9px] text-slate-400">{audioMimeType}</p>
                  <audio src={audioUrl} controls className="w-full mt-1.5 h-7" style={{ maxWidth: "100%" }} />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAudioUrl(null);
                    setAudioGcsUri(null);
                    setAudioFileName(null);
                  }}
                  className="p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <div className="p-3 bg-white rounded-lg shadow-sm border border-violet-100">
                  <Upload size={20} />
                </div>
                <div className="text-center px-4">
                  <p className="text-sm font-bold text-slate-600">Upload dialogue audio</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">WAV &middot; MP3 &middot; M4A &middot; AAC</p>
                </div>
              </div>
            )}
          </div>
          {audioUploadError && (
            <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-medium bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={13} /> {audioUploadError}
            </div>
          )}
          <input ref={audioFileInputRef} type="file" accept="audio/wav,audio/mp3,audio/mpeg,audio/m4a,audio/aac,audio/x-wav,.wav,.mp3,.m4a,.aac" className="hidden" onChange={handleAudioUpload} />
        </div>

        {/* Prompt (required) */}
        <div className="space-y-2">
          <SectionLabel>Prompt <span className="text-red-400">*</span></SectionLabel>
          <p className="text-[10px] text-slate-400">Describe the character(s) and scene. Must match the reference image for best lip-sync.</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={1024}
            placeholder="A woman speaking passionately about shampoo, medium shot, static camera..."
            className="w-full h-28 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
          <div className="flex justify-end">
            <span className={`text-[9px] font-mono ${prompt.length > 950 ? "text-amber-500" : "text-slate-300"}`}>
              {prompt.length}/1024
            </span>
          </div>
        </div>

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
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-3">
              {/* Sharpness */}
              <div className="space-y-2">
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

        {/* Best practices info */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-bold text-amber-700">Tips for Best Results</p>
          <ul className="text-[9px] text-amber-600 space-y-0.5 list-disc list-inside">
            <li>Prompt must accurately describe the character in the image</li>
            <li>Single character, closeup/medium shot with mouth visible</li>
            <li>Use static camera descriptions for best performance</li>
            <li>Describe the scene rather than instruct the model</li>
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
            <><Mic size={16} /> Generate Dialogue Video</>
          )}
        </button>
        {!canSubmit && (
          <p className="text-[10px] text-slate-400 text-center">
            {!imageGcsUri ? "Upload a start frame image" :
             !audioGcsUri ? "Upload a dialogue audio file" :
             "Enter a text prompt"} to generate
          </p>
        )}
      </div>
    </div>
  );
};

export default DialoguePanel;
