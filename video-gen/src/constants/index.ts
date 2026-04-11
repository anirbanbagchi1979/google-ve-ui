// src/constants/index.ts
// Centralized constants for the video-gen app.
// All hardcoded values belong here — never inline magic strings/numbers in components or hooks.

// --- Vertex AI Model Names ---
export const MODELS = {
  VIDEO_GEN: "veo-001",
  EXPERIMENTAL: "veo-experimental",
  UPSCALE: "veo3p1_upscale",
  PERF_ESTIMATION: "veo-exp-perf-estimation",
  PERF_GENERATION: "veo-exp-perf-generation",
  VIDEO_TRANSFORM: "veo-exp-video-transform",
} as const;

// --- API Endpoints & Config ---
export const API = {
  PROXY_URL: "https://vef-proxy-uhz33244pa-uc.a.run.app",
  VERTEX_SCOPE: "https://www.googleapis.com/auth/cloud-platform",
  VERTEX_REQUEST_TYPE: "shared",
  DEFAULT_REGION: "us-central1",
} as const;

// --- Generation Defaults ---
export const DEFAULTS = {
  DURATION_SECONDS: 5,
  SAMPLE_COUNT: 1,
  ASPECT_RATIO: "16:9" as const,
  FPS: 24,
  COMPRESSION_QUALITY: "optimized" as const,
  RESOLUTION: "4k" as const,
  SEED: 777,
  PERF_GENERATION_SEED: 78,
  TRANSFORM_STRENGTH: 0.88,
  TRANSFORM_STEPS: 20,
  TRANSFORM_STEPS_MAX: 250,
  POLL_INTERVAL_SECONDS: 10,
  OUTPUT_FOLDER: "outputs",
} as const;

// --- Firestore Collection Names ---
export const COLLECTIONS = {
  OPERATIONS: "operations",
  VIDEOS: "videos",
  PROJECTS: "projects",
  USERS: "users",
  ALLOWLIST: "allowlist",
  PERF_MESHES: "perfMeshes",
  PERF_CHARACTERS: "perfCharacters",
  MASK_VIDEOS: "maskVideos",
} as const;

// --- Firebase Storage Paths ---
export const STORAGE_PATHS = {
  VIDEOS: "videos",
  IMAGES: "images",
  MASKS: "masks",
  PERF_MESHES: "perfMeshes",
  BLUE_MESHES: "bluemeshes",
} as const;

// --- Pagination ---
export const PAGE_SIZES = {
  OPERATIONS: 10,
  VIDEOS: 4,
  MESHES: 5,
  MASK_VIDEOS: 20,
  PERF_TRACKER: 5,
  CHARACTERS: 20,
  MAX_LOGS: 50,
} as const;

// --- localStorage Keys ---
export const STORAGE_KEYS = {
  DASHBOARD_CONFIG: "veo_dashboard_config",
  CURRENT_PROJECT: "veo_current_project_id",
} as const;

// --- MIME Types ---
export const MIME = {
  VIDEO_MP4: "video/mp4",
  IMAGE_JPEG: "image/jpeg",
  IMAGE_PNG: "image/png",
} as const;
