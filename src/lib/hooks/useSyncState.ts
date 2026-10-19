"use client";

import { useSyncExternalStore } from "react";
import { getSyncState, subscribeSync, type SyncState } from "@/lib/db/sync";

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}
