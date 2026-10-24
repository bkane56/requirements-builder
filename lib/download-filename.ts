export const DOWNLOAD_FILENAME_STEM = "PROJECT_REQUIREMENTS";
export const DOWNLOAD_FILENAME_EXTENSION = ".md";
export const DOWNLOAD_COUNT_STORAGE_KEY = "requirements-builder.download-count";

// completedDownloads is how many downloads this tab has already started.
// Starting a download does not mean the user finished saving the file.
// A later session can reuse a name that already exists in Downloads.

export function downloadFilename(completedDownloads: number): string {
  const base = `${DOWNLOAD_FILENAME_STEM}${DOWNLOAD_FILENAME_EXTENSION}`;
  if (!Number.isInteger(completedDownloads) || completedDownloads <= 0) return base;
  return `${DOWNLOAD_FILENAME_STEM} (${completedDownloads})${DOWNLOAD_FILENAME_EXTENSION}`;
}

export function parseStoredDownloadCount(raw: string | null): number {
  if (raw === null) return 0;
  const count = Number(raw);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}
