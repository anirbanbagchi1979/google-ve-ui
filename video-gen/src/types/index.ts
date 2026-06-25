// src/types/index.ts

import { Timestamp } from "firebase/firestore";

export interface VideoAsset {
  id: string;
  name: string;
  url: string;
  size?: number;
  aspectRatio?: string;
  createdAt: Timestamp | null;
}

export type OperationType = "generation" | "upscale" | "transform" | "perf-estimation" | "perf-generation" | "a2v-generation";

export interface OperationResult {
  videos?: Array<{ gcsUri: string; mimeType?: string }>;
  video?: { gcsUri: string };
  [key: string]: unknown;
}

export interface Operation {
  id: string;
  name: string;
  status: "RUNNING" | "DONE" | "ERROR";
  type: OperationType;
  userEmail?: string;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  result?: OperationResult | null;
  payload?: Record<string, unknown>;
  originalGcsUri?: string;
  modelUsed?: string;
  error?: {
    code: number;
    message: string;
  };
  // Generation parameters
  projectId?: string;
  inputGcsUri?: string | null;
  inputType?: string | null;
  prompt?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  sampleCount?: number | null;
  fps?: number | null;
  compressionQuality?: string | null;
  resolution?: string | null;
  videoTransformStrength?: number | null;
  numDiffusionSteps?: number | null;
  inputFileSize?: number | null;
  maskVideoGcsUri?: string | null;
  // Performance-specific fields
  inputVideoUrl?: string;
  outputGcsUri?: string;
  outputVideoUrl?: string;
  perfMeshDocId?: string;
  meshGcsUri?: string;
  meshVideoUrl?: string;
  characterImageGcsUri?: string;
  characterImageUrl?: string;
  sourceVideoUrl?: string;
  sourceEstimationOpId?: string;
  // Audio-to-Video (dialogue) specific fields
  audioGcsUri?: string;
  audioUrl?: string;
  imageGcsUri?: string;
  imageUrl?: string;
  sharpness?: number;
}

export interface GenerationPayload {
  instances: Array<{
    prompt?: string;
    video?: { gcsUri: string; mimeType: string };
    referenceImages?: Array<{ image: { gcsUri: string; mimeType: string }; referenceType?: string }>;
    referenceAudios?: Array<{ audio: { gcsUri?: string; bytesBase64Encoded?: string; mimeType: string } }>;
    fps?: number;
    image?: { gcsUri?: string; bytesBase64Encoded?: string; mimeType: string };
    sharpness?: number;
  }>;
  parameters?: {
    task?: string;
    durationSeconds?: number;
    sampleCount?: number;
    aspectRatio?: string;
    compressionQuality?: string;
    resolution?: string;
    storageUri?: string;
    seed?: number;
    experiments?: Record<string, unknown>;
  };
  _model?: string;
  _operationType?: string;
  _inputFileSize?: number | null;
  _inputVideoUrl?: string;
  _meshVideoUrl?: string;
  _characterImageUrl?: string;
  _sourceVideoUrl?: string;
  _audioUrl?: string;
  _imageUrl?: string;
}

export interface PerfMesh {
  id: string;
  name: string;
  url: string;
  gcsUri: string;
  sourceVideoUrl?: string;
  sourceVideoGcsUri?: string;
  sourceOperationId?: string;
  projectId: string;
  createdAt: Timestamp | null;
}

export interface PerfCharacter {
  id: string;
  name: string;
  url: string;
  gcsUri: string;
  mimeType: string;
  projectId: string;
  createdAt: Timestamp | null;
}

export interface Log {
  id?: string;
  type: "REQUEST" | "RESPONSE" | "ERROR" | "FLOW";
  message: string;
  status?: number;
  endpoint?: string;
  operationId?: string;
  payload?: object;
  data?: object;
  timestamp?: string;
  details?: string;
}
