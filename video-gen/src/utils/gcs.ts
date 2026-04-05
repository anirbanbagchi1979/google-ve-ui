// src/utils/gcs.ts

/**
 * Convert a Firebase Storage download URL or gs:// URI to a gs:// URI.
 */
export const getGcsUri = (url: string | null): string => {
  if (!url) return "";
  if (url.startsWith("gs://")) return url;
  if (url.includes("firebasestorage.googleapis.com")) {
    try {
      const decodedUrl = decodeURIComponent(url);
      const bucketMatch = url.match(/\/b\/([^/]+)/);
      const pathMatch = decodedUrl.match(/\/o\/([^?]+)/);
      if (bucketMatch && pathMatch) {
        return `gs://${bucketMatch[1]}/${pathMatch[1]}`;
      }
    } catch (e) {
      console.error("Error parsing Firebase URL", e);
    }
  }
  return `gs://video-gen-assets/${url.split("/").pop()?.split("?")[0]}`;
};

/**
 * Convert a gs://bucket/path URI to a Firebase Storage download URL.
 */
export const gcsToFirebaseUrl = (gcsUri: string): string => {
  const withoutScheme = gcsUri.replace("gs://", "");
  const slashIdx = withoutScheme.indexOf("/");
  const bucket = withoutScheme.substring(0, slashIdx);
  const path = withoutScheme.substring(slashIdx + 1);
  const encodedPath = path.split("/").map(encodeURIComponent).join("%2F");
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
};
