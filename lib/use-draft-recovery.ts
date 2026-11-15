"use client";

import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createDraftPersistence, type DraftRecovery, type DraftTimer } from "./draft-recovery";

export function useDraftRecovery(storage: Storage | null | undefined, options?: { delayMs?: number; timer?: DraftTimer }) {
  // Timer options are fixed for the life of this controller. Phase 2 passes the browser timer.
  const [controller] = useState(() => createDraftPersistence(options));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);

  useLayoutEffect(() => {
    // Undefined means the caller has not chosen storage yet. Restoring now would publish an empty draft.
    if (storage === undefined) return;
    controller.restore(storage ?? emptyStorage);
    if (!storage) return;
    return () => {
      controller.flush(storage);
    };
  }, [controller, storage]);

  useEffect(() => {
    if (!storage || !snapshot.ready) return;
    const flush = () => {
      controller.flush(storage);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [controller, snapshot.ready, storage]);

  const schedule = useCallback(
    (draft: DraftRecovery, generation: number) => {
      if (!storage) return;
      controller.schedule(storage, draft, generation);
    },
    [controller, storage],
  );

  const flush = useCallback(() => {
    if (!storage) return;
    controller.flush(storage);
  }, [controller, storage]);

  const reset = useCallback(() => controller.reset(storage ?? null), [controller, storage]);

  const acceptsGeneration = useCallback(
    (generation: number) => controller.acceptsGeneration(generation),
    [controller],
  );

  return {
    ready: snapshot.ready,
    generation: snapshot.generation,
    draft: snapshot.draft,
    lastSave: snapshot.lastSave,
    schedule,
    flush,
    reset,
    acceptsGeneration,
  };
}

const emptyStorage: Storage = {
  get length() {
    return 0;
  },
  clear() {},
  getItem() {
    return null;
  },
  key() {
    return null;
  },
  removeItem() {},
  setItem() {},
};
