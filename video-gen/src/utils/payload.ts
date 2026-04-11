// src/utils/payload.ts
import { getGcsUri } from "./gcs";
import { MODELS, DEFAULTS, STORAGE_PATHS, MIME } from "@/constants";
import { generateTimestamp } from "./time";

interface AppConfig {
  gcsBucket: string;
  outputFolder: string;
}

/**
 * Build a Vertex AI generation payload.
 */
export const buildGenerationPayload = (
  promptText: string,
  selectedAssetUrl: string | null,
  selectedAssetType: "image" | "video" | null
): object => {
  return {
    instances: [
      {
        prompt: promptText,
        ...(selectedAssetUrl && selectedAssetType === "image"
          ? {
              referenceImages: [
                {
                  image: {
                    gcsUri: getGcsUri(selectedAssetUrl),
                    mimeType: MIME.IMAGE_JPEG,
                  },
                  referenceType: "asset",
                },
              ],
            }
          : selectedAssetUrl && selectedAssetType === "video"
          ? {
              video: {
                gcsUri: getGcsUri(selectedAssetUrl),
                mimeType: MIME.VIDEO_MP4,
              },
            }
          : {}),
      },
    ],
    parameters: {
      durationSeconds: DEFAULTS.DURATION_SECONDS,
      sampleCount: DEFAULTS.SAMPLE_COUNT,
      aspectRatio: DEFAULTS.ASPECT_RATIO,
    },
  };
};

/**
 * Build a Vertex AI performance estimation (blue mesh extraction) payload.
 */
export const buildPerfEstimationPayload = (
  videoGcsUri: string,
  config: AppConfig,
  seed: number = DEFAULTS.SEED
): object => {
  const timestamp = generateTimestamp();
  const outputUri = `gs://${config.gcsBucket}/${STORAGE_PATHS.BLUE_MESHES}/bluemesh_${timestamp}`;

  return {
    _model: MODELS.EXPERIMENTAL,
    _operationType: "perf-estimation",
    instances: [
      {
        video: { gcsUri: videoGcsUri, mimeType: MIME.VIDEO_MP4 },
      },
    ],
    parameters: {
      seed,
      storageUri: outputUri,
      experiments: { modelName: MODELS.PERF_ESTIMATION },
    },
  };
};

/**
 * Build a Vertex AI performance generation (character performance) payload.
 */
export const buildPerfGenerationPayload = (
  meshGcsUri: string,
  imageGcsUri: string,
  imageMimeType: string,
  config: AppConfig,
  options: {
    prompt?: string;
    seed?: number;
    compressionQuality?: "optimized" | "lossless";
  } = {}
): object => {
  const { prompt, seed = DEFAULTS.PERF_GENERATION_SEED, compressionQuality = DEFAULTS.COMPRESSION_QUALITY } = options;
  const timestamp = generateTimestamp();
  const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

  return {
    _model: MODELS.EXPERIMENTAL,
    _operationType: "perf-generation",
    instances: [
      {
        ...(prompt ? { prompt } : {}),
        referenceImages: [
          {
            image: { gcsUri: imageGcsUri, mimeType: imageMimeType },
            referenceType: "ASSET",
          },
        ],
      },
    ],
    parameters: {
      seed,
      compressionQuality,
      storageUri: outputUri,
      experiments: {
        modelName: MODELS.PERF_GENERATION,
        perfMeshGcsUri: meshGcsUri,
      },
    },
  };
};

/**
 * Build a Vertex AI upscale payload.
 */
export const buildUpscalePayload = (gcsUri: string, config: AppConfig): object => {
  const timestamp = generateTimestamp();
  const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

  return {
    instances: [
      {
        video: { gcsUri, mimeType: MIME.VIDEO_MP4 },
        fps: DEFAULTS.FPS,
      },
    ],
    parameters: {
      task: "upscale",
      compressionQuality: DEFAULTS.COMPRESSION_QUALITY,
      resolution: DEFAULTS.RESOLUTION,
      aspectRatio: DEFAULTS.ASPECT_RATIO,
      storageUri: outputUri,
      experiments: { modelName: MODELS.UPSCALE },
    },
  };
};
