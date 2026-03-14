import { create } from "zustand";
import { Lab, Solution } from "../types";

interface AppStore {
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  activeSolving: string | null;
  setActiveSolving: (slug: string | null) => void;
  replayData: Record<string, Solution>;
  setReplayData: (slug: string, solution: Solution) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  selectedCategory: "all",
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  activeSolving: null,
  setActiveSolving: (slug) => set({ activeSolving: slug }),
  replayData: {},
  setReplayData: (slug, solution) =>
    set((state) => ({ replayData: { ...state.replayData, [slug]: solution } })),
}));
