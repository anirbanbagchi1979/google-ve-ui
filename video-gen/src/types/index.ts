// src/types/index.ts

export interface VideoAsset {
  id: string;
  name: string;
  url: string;
  createdAt: any;
}

export type OperationType = "generation" | "upscale" | "transform" | "perf-estimation" | "perf-generation";

export interface Operation {
  id: string;
  name: string;
  status: "RUNNING" | "DONE" | "ERROR";
  type: string;
  userEmail?: string;
  createdAt: any;
  updatedAt?: any;
  completedAt?: any;
  result?: any;
  payload?: any;
  originalGcsUri?: string;
  modelUsed?: string;
  error?: {
    code: number;
    message: string;
  };
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
  createdAt: any;
}

export interface PerfCharacter {
  id: string;
  name: string;
  url: string;
  gcsUri: string;
  mimeType: string;
  projectId: string;
  createdAt: any;
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
