import fs from "fs/promises";
import path from "path";
import { config } from "@/config/config";
import logger from "@/config/logger";
import { myDayjs } from "@/utils/myDayjs";

/**
 * Service to clean up old download folders
 * Removes folders older than 24 hours to prevent disk space exhaustion
 */
export class CleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private readonly FOLDER_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Start periodic cleanup job
   */
  start(): void {
    if (this.cleanupInterval) {
      logger.warning("Cleanup service already started");
      return;
    }

    // Run cleanup immediately on start
    this.cleanup().catch((error) => {
      logger.error("Error in initial cleanup", { error });
    });

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch((error) => {
        logger.error("Error in periodic cleanup", { error });
      });
    }, this.CLEANUP_INTERVAL_MS);

    logger.info("Cleanup service started");
  }

  /**
   * Stop cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info("Cleanup service stopped");
    }
  }

  /**
   * Perform cleanup of old download folders
   */
  async cleanup(): Promise<void> {
    const downloadDir = config.downloadDir;
    const cutoffTime = myDayjs()
      .subtract(this.FOLDER_MAX_AGE_MS, "millisecond")
      .toDate();

    try {
      // Check if download directory exists
      await fs.access(downloadDir);
    } catch {
      // Directory doesn't exist, nothing to clean
      logger.debug("Download directory does not exist, skipping cleanup");
      return;
    }

    let deletedCount = 0;
    let errorCount = 0;
    let totalSize = 0;

    try {
      const entries = await fs.readdir(downloadDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const folderPath = path.join(downloadDir, entry.name);

        try {
          const stats = await fs.stat(folderPath);

          // Check if folder is older than cutoff time
          if (stats.mtime < cutoffTime) {
            // Calculate folder size before deletion
            const folderSize = await this.getFolderSize(folderPath);
            totalSize += folderSize;

            // Remove folder
            await fs.rm(folderPath, { recursive: true });
            deletedCount++;

            logger.debug("Deleted old download folder", {
              folderPath,
              age: myDayjs().diff(stats.mtime, "hours"),
              size: folderSize,
            });
          }
        } catch (error) {
          errorCount++;
          logger.error("Error cleaning up folder", {
            folderPath,
            error,
          });
        }
      }

      if (deletedCount > 0) {
        logger.info("Cleanup completed", {
          deletedCount,
          errorCount,
          totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        });
      }
    } catch (error) {
      logger.error("Error during cleanup", { error });
    }
  }

  /**
   * Calculate total size of a folder recursively
   */
  private async getFolderSize(folderPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.getFolderSize(entryPath);
        } else {
          try {
            const stats = await fs.stat(entryPath);
            totalSize += stats.size;
          } catch {
            // Ignore errors for individual files
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return totalSize;
  }
}

export const cleanupService = new CleanupService();
