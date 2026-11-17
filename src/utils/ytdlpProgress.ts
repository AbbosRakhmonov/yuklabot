export interface IDownloadProgress {
  downloaded: number; // bytes
  total?: number; // bytes, exact or estimated
  speed?: number; // bytes per second
  eta?: number; // seconds
}

export type ProgressCallback = (progress: IDownloadProgress) => void;

const PROGRESS_PREFIX = "[yuklabot-progress]";

const PROGRESS_TEMPLATE =
  `download:${PROGRESS_PREFIX}` +
  "%(progress.downloaded_bytes)s|%(progress.total_bytes)s|" +
  "%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";

// yt-dlp prints "NA" for unknown values
const toNumber = (value: string | undefined): number | undefined => {
  const num = Number(value);
  return value && Number.isFinite(num) ? num : undefined;
};

export const parseYtdlpProgress = (line: string): IDownloadProgress | null => {
  if (!line.startsWith(PROGRESS_PREFIX)) return null;

  const [downloaded, total, totalEstimate, speed, eta] = line
    .slice(PROGRESS_PREFIX.length)
    .split("|")
    .map(toNumber);

  if (downloaded === undefined) return null;

  return { downloaded, total: total ?? totalEstimate, speed, eta };
};

/**
 * yt-dlp args and stdout line handler that report download progress.
 * Progress lines go to stdout (one per line thanks to --newline) and are kept
 * out of the buffered output, so `-j` JSON still parses.
 */
export const getYtdlpProgressOptions = (
  onProgress?: ProgressCallback,
): { args: string[]; onStdoutLine?: (line: string) => boolean } => {
  if (!onProgress) return { args: [] };

  return {
    args: ["--newline", "--progress", "--progress-template", PROGRESS_TEMPLATE],
    onStdoutLine: (line) => {
      const progress = parseYtdlpProgress(line);
      if (!progress) return false;
      onProgress(progress);
      return true;
    },
  };
};
