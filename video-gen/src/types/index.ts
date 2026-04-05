// src/types/index.ts

export interface VideoAsset {
  id: string;
  name: string;
  url: string;
  createdAt: any;
}

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
