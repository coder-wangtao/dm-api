import { create } from "zustand";
import { serverApi } from "../lib/api";
import type { ServerStatus } from "../types";

interface ServerState {
  status: ServerStatus | null;
  refresh: () => Promise<void>;
}

export const useServerStatus = create<ServerState>((set) => ({
  status: null,
  refresh: async () => {
    try {
      set({ status: await serverApi.getStatus() });
    } catch {
      set({ status: null });
    }
  },
}));
