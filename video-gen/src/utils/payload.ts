// src/utils/payload.ts
import { getGcsUri } from "./gcs";
import { MODELS, DEFAULTS, STORAGE_PATHS, MIME } from "@/constants";
import type { GenerationPayload } from "@/types";
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

/**
 * Build a Vertex AI dialogue-driven (audio-to-video) generation payload.
 */
export const buildA2VGenerationPayload = (
  imageGcsUri: string,
  imageMimeType: string,
  audioGcsUri: string,
  audioMimeType: string,
  prompt: string,
  config: AppConfig,
  options: {
    sharpness?: number;
  } = {}
): GenerationPayload => {
  const { sharpness = 1 } = options;
  const timestamp = generateTimestamp();
  const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

  return {
    _model: MODELS.EXPERIMENTAL,
    _operationType: "a2v-generation",
    instances: [
      {
        prompt,
        image: {
          gcsUri: imageGcsUri,
          mimeType: imageMimeType,
        },
        referenceAudios: [
          {
            audio: {
              gcsUri: audioGcsUri,
              mimeType: audioMimeType,
            },
          },
        ],
        sharpness,
      },
    ],
    parameters: {
      storageUri: outputUri,
      experiments: {
        modelName: MODELS.A2V_GENERATION,
      },
    },
  };
};

/**
 * Build a Vertex AI video textures (tessellation & looping) payload.
 * Supports T2V (prompt only) and I2V (prompt + image + optional lastFrame).
 */
export const buildTextureGenerationPayload = (
  prompt: string,
  config: AppConfig,
  options: {
    loop?: boolean;
    tessellateHorizontal?: boolean;
    tessellateVertical?: boolean;
    imageGcsUri?: string;
    imageMimeType?: string;
    lastFrameGcsUri?: string;
    lastFrameMimeType?: string;
    seed?: number;
    sharpness?: number;
  } = {}
): GenerationPayload => {
  const {
    loop = false,
    tessellateHorizontal = false,
    tessellateVertical = false,
    imageGcsUri,
    imageMimeType,
    lastFrameGcsUri,
    lastFrameMimeType,
    seed = DEFAULTS.SEED,
    sharpness = 1,
  } = options;
  const timestamp = generateTimestamp();
  const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

  const instance: Record<string, unknown> = { prompt };

  if (imageGcsUri && imageMimeType) {
    instance.image = { gcsUri: imageGcsUri, mimeType: imageMimeType };
  }
  if (lastFrameGcsUri && lastFrameMimeType) {
    instance.lastFrame = { gcsUri: lastFrameGcsUri, mimeType: lastFrameMimeType };
  }
  if (sharpness !== 1) {
    instance.sharpness = sharpness;
  }

  return {
    _model: MODELS.EXPERIMENTAL,
    _operationType: "texture-generation",
    instances: [instance as GenerationPayload["instances"][0]],
    parameters: {
      seed,
      storageUri: outputUri,
      experiments: {
        modelName: MODELS.VIDEO_TEXTURES,
        seamless: {
          loop,
          tessellateHorizontal,
          tessellateVertical,
        },
      },
    },
  };
};

/**
 * Build a Vertex AI multi-keyframe conditioning (I2V) payload.
 * Uses the video-transform model with start frame, optional last frame,
 * and intermediate conditioning frames at multiples of 8.
 */
export const buildKeyframeGenerationPayload = (
  prompt: string,
  startFrameGcsUri: string,
  startFrameMimeType: string,
  config: AppConfig,
  options: {
    lastFrameGcsUri?: string;
    lastFrameMimeType?: string;
    conditioningFrames?: Array<{ gcsUri: string; mimeType: string; frameNum: number }>;
    seed?: number;
    sharpness?: number;
  } = {}
): GenerationPayload => {
  const {
    lastFrameGcsUri,
    lastFrameMimeType,
    conditioningFrames = [],
    seed = DEFAULTS.SEED,
    sharpness = 1,
  } = options;
  const timestamp = generateTimestamp();
  const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

  const instance: Record<string, unknown> = {
    prompt,
    image: { gcsUri: startFrameGcsUri, mimeType: startFrameMimeType },
  };

  if (lastFrameGcsUri && lastFrameMimeType) {
    instance.lastFrame = { gcsUri: lastFrameGcsUri, mimeType: lastFrameMimeType };
  }
  if (sharpness !== 1) {
    instance.sharpness = sharpness;
  }

  const experimentsObj: Record<string, unknown> = {
    modelName: MODELS.VIDEO_TRANSFORM,
  };

  if (conditioningFrames.length > 0) {
    experimentsObj.conditioningFrames = conditioningFrames.map(cf => ({
      image: { gcsUri: cf.gcsUri, mimeType: cf.mimeType },
      frameNum: cf.frameNum,
    }));
  }

  return {
    _model: MODELS.EXPERIMENTAL,
    _operationType: "keyframe-generation",
    instances: [instance as GenerationPayload["instances"][0]],
    parameters: {
      seed,
      storageUri: outputUri,
      experiments: experimentsObj,
    },
  };
};
