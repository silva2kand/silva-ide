import { getHeartbeatService } from "../agents/HeartbeatService";
import { runCctvPosWatcher } from "../../agents/cctv-pos-watcher";

export type CctvPosFrame = { id: string; path: string; type: "cctv" | "pos" };

let timer: NodeJS.Timeout | null = null;

export function startCctvPosHeartbeatHook(
  frameProvider: () => Promise<CctvPosFrame[]>,
  intervalMs = 60 * 60 * 1000,
): void {
  if (timer) return;

  const run = async () => {
    try {
      const frames = await frameProvider();
      if (Array.isArray(frames) && frames.length > 0) {
        await runCctvPosWatcher(async () => frames);
        getHeartbeatService()?.submitWakeForAll({
          text: "CCTV/POS OCR updated",
          mode: "next-heartbeat",
          source: "cron",
        });
      }
    } catch {
      // no-op
    }
  };

  timer = setInterval(run, Math.max(10_000, intervalMs));
  void run();
}

export function stopCctvPosHeartbeatHook(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
