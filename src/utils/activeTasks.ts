import { EventEmitter } from "events";
import { EPlatform } from "@/enums/EPlatform";
import { EMediaType } from "@/enums/EMediaType";
import logger from "@/config/logger";

export type TaskStage =
  | "analyzing"
  | "downloading"
  | "splitting"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

export interface ITaskProgress {
  downloaded?: number;
  total?: number;
  percent?: number;
  speed?: number;
  eta?: number;
}

export interface IActiveTask {
  id: string;
  userId: number;
  username?: string;
  firstName?: string;
  platform: EPlatform;
  mediaType: EMediaType;
  url: string;
  title?: string;
  quality?: string;
  stage: TaskStage;
  progress: ITaskProgress;
  startedAt: Date;
  updatedAt: Date;
  error?: string;
  isStuck: boolean;
}

export interface IStartTaskOptions {
  userId: number;
  username?: string;
  firstName?: string;
  platform: EPlatform;
  mediaType?: EMediaType;
  url: string;
  title?: string;
  quality?: string;
  signal?: AbortSignal;
}

export class TaskController {
  private task: IActiveTask;
  private readonly abortController: AbortController;
  private readonly manager: ActiveTaskManager;

  constructor(task: IActiveTask, abortController: AbortController, manager: ActiveTaskManager) {
    this.task = task;
    this.abortController = abortController;
    this.manager = manager;
  }

  get id(): string {
    return this.task.id;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  setTitle(title: string): void {
    this.task.title = title;
    this.task.updatedAt = new Date();
    this.manager.notifyUpdate(this.task);
  }

  setQuality(quality: string): void {
    this.task.quality = quality;
    this.task.updatedAt = new Date();
    this.manager.notifyUpdate(this.task);
  }

  setMediaType(mediaType: EMediaType): void {
    this.task.mediaType = mediaType;
    this.task.updatedAt = new Date();
    this.manager.notifyUpdate(this.task);
  }

  updateStage(stage: TaskStage): void {
    this.task.stage = stage;
    this.task.updatedAt = new Date();
    this.manager.notifyUpdate(this.task);
  }

  updateProgress(progress: Partial<ITaskProgress>): void {
    this.task.progress = { ...this.task.progress, ...progress };
    if (progress.total && progress.downloaded && progress.total > 0) {
      this.task.progress.percent = Math.min(
        100,
        Math.floor((progress.downloaded / progress.total) * 100)
      );
    }
    this.task.updatedAt = new Date();
    this.manager.notifyUpdate(this.task);
  }

  complete(): void {
    this.task.stage = "completed";
    this.task.progress.percent = 100;
    this.task.updatedAt = new Date();
    this.manager.removeTask(this.task.id, "completed");
  }

  fail(error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.task.stage = "failed";
    this.task.error = errorMsg;
    this.task.updatedAt = new Date();
    this.manager.removeTask(this.task.id, "failed", errorMsg);
  }

  cancel(): void {
    this.abortController.abort();
    this.task.stage = "cancelled";
    this.task.updatedAt = new Date();
    this.manager.removeTask(this.task.id, "cancelled");
  }
}

class ActiveTaskManager extends EventEmitter {
  private tasks = new Map<string, { task: IActiveTask; controller: AbortController }>();
  private completedRecent: IActiveTask[] = []; // Last 50 completed/failed tasks for quick history
  private readonly STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes without progress or in same stage

  constructor() {
    super();
    // Check for stuck tasks periodically
    setInterval(() => this.checkStuckTasks(), 30000);
  }

  startTask(options: IStartTaskOptions): TaskController {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const abortController = new AbortController();

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        abortController.abort();
      }, { once: true });
    }

    const task: IActiveTask = {
      id,
      userId: options.userId,
      username: options.username,
      firstName: options.firstName,
      platform: options.platform,
      mediaType: options.mediaType ?? EMediaType.VIDEO,
      url: options.url,
      title: options.title,
      quality: options.quality,
      stage: "analyzing",
      progress: {},
      startedAt: new Date(),
      updatedAt: new Date(),
      isStuck: false,
    };

    this.tasks.set(id, { task, controller: abortController });
    this.emit("task:started", task);
    this.emit("change");

    return new TaskController(task, abortController, this);
  }

  notifyUpdate(task: IActiveTask): void {
    this.checkTaskStuckStatus(task);
    this.emit("task:updated", task);
    this.emit("change");
  }

  removeTask(id: string, stage: TaskStage, error?: string): void {
    const entry = this.tasks.get(id);
    if (!entry) return;

    const { task } = entry;
    task.stage = stage;
    task.updatedAt = new Date();
    if (error) task.error = error;

    this.tasks.delete(id);

    // Keep last 50 in memory for immediate feed
    this.completedRecent.unshift(task);
    if (this.completedRecent.length > 50) {
      this.completedRecent.pop();
    }

    this.emit("task:finished", task);
    this.emit("change");
  }

  getActiveTasks(): IActiveTask[] {
    const now = Date.now();
    return Array.from(this.tasks.values()).map(({ task }) => {
      this.checkTaskStuckStatus(task, now);
      return { ...task };
    });
  }

  getRecentCompleted(): IActiveTask[] {
    return [...this.completedRecent];
  }

  getTask(id: string): IActiveTask | undefined {
    return this.tasks.get(id)?.task;
  }

  killTask(id: string): boolean {
    const entry = this.tasks.get(id);
    if (!entry) return false;

    logger.warning(`Admin killed task: ${id}`, {
      userId: entry.task.userId,
      platform: entry.task.platform,
      url: entry.task.url,
    });

    entry.controller.abort();
    this.removeTask(id, "cancelled", "Killed by administrator");
    return true;
  }

  private checkTaskStuckStatus(task: IActiveTask, now = Date.now()): void {
    const age = now - task.startedAt.getTime();
    const idle = now - task.updatedAt.getTime();

    // Considered stuck if total time > 10 min or no updates for > 5 min
    task.isStuck = age > this.STUCK_THRESHOLD_MS * 2 || idle > this.STUCK_THRESHOLD_MS;
  }

  private checkStuckTasks(): void {
    const now = Date.now();
    for (const { task } of this.tasks.values()) {
      const wasStuck = task.isStuck;
      this.checkTaskStuckStatus(task, now);
      if (!wasStuck && task.isStuck) {
        logger.warning(`Task might be stuck: ${task.id}`, {
          userId: task.userId,
          platform: task.platform,
          stage: task.stage,
          durationSeconds: Math.round((now - task.startedAt.getTime()) / 1000),
        });
        this.emit("task:stuck", task);
      }
    }
  }

  getSummary(): {
    activeCount: number;
    stuckCount: number;
    platformCounts: Record<string, number>;
  } {
    let stuckCount = 0;
    const platformCounts: Record<string, number> = {
      [EPlatform.YOUTUBE]: 0,
      [EPlatform.INSTAGRAM]: 0,
      [EPlatform.TIKTOK]: 0,
    };

    for (const { task } of this.tasks.values()) {
      if (task.isStuck) stuckCount++;
      if (task.platform in platformCounts) {
        platformCounts[task.platform]++;
      }
    }

    return {
      activeCount: this.tasks.size,
      stuckCount,
      platformCounts,
    };
  }
}

export const activeTasks = new ActiveTaskManager();
