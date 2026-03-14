import axios from "axios";
import { Lab, LabDetail, Solution } from "../types";

const api = axios.create({ baseURL: "/api" });

export const labsApi = {
  list: (): Promise<Lab[]> => api.get("/labs/").then((r) => r.data),
  get: (slug: string): Promise<LabDetail> => api.get(`/labs/${slug}`).then((r) => r.data),
  solve: (slug: string, execute = false): Promise<{ message: string; solution: Solution }> =>
    api.post(`/labs/${slug}/solve`, { lab_slug: slug, execute }).then((r) => r.data),
  replay: (slug: string): Promise<Solution> => api.post(`/labs/${slug}/replay`).then((r) => r.data),
  pushGitHub: (slug: string): Promise<{ success: boolean; pr_url?: string; message?: string }> =>
    api.post(`/labs/${slug}/push-github`).then((r) => r.data),
  sync: (): Promise<{ added: number; updated: number }> =>
    api.post("/labs/sync").then((r) => r.data),
};
