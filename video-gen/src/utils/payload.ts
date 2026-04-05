// src/utils/payload.ts
import { getGcsUri } from "./gcs";

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
                    mimeType: "image/jpeg",
                  },
                  referenceType: "asset",
                },
              ],
            }
          : selectedAssetUrl && selectedAssetType === "video"
          ? {
              video: {
                gcsUri: getGcsUri(selectedAssetUrl),
                mimeType: "video/mp4",
              },
            }
          : {}),
      },
    ],
    parameters: {
      durationSeconds: 5,
      sampleCount: 1,
      aspectRatio: "16:9",
    },
  };
};

/**
 * Build a Vertex AI upscale payload.
 */
export const buildUpscalePayload = (gcsUri: string, config: AppConfig): object => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19)
    .replace("T", "_");
  const outputUri = `gs://${config.gcsBucket}/${config.outputFolder}/video_${timestamp}`;

  return {
    instances: [
      {
        video: { gcsUri, mimeType: "video/mp4" },
        fps: 24,
      },
    ],
    parameters: {
      task: "upscale",
      compressionQuality: "optimized",
      resolution: "4k",
      aspectRatio: "16:9",
      storageUri: outputUri,
      experiments: { modelName: "veo3p1_upscale" },
    },
  };
};
