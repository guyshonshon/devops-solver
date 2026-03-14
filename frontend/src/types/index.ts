export type Category = "linux" | "git" | "python" | "homework";
export type SolutionStatus = "unsolved" | "pending" | "solving" | "solved" | "failed";
export type StepType = "explanation" | "command" | "code" | "git" | "docker" | "output";
export type StepStatus = "pending" | "running" | "success" | "error";

export interface Lab {
  slug: string;
  title: string;
  category: Category;
  subcategory: string | null;
  url: string;
  solved: boolean;
  solution_status: SolutionStatus;
  discovered_at: string;
  last_scraped: string | null;
}

export interface LabDetail extends Lab {
  content: string;
  questions: Question[];
  solution: Solution | null;
}

export interface Question {
  id: number;
  number: number;
  text: string;
  full_text: string;
}

export interface SolutionStep {
  id: string;
  type: StepType;
  title: string;
  content: string;
  output?: string;
  status: StepStatus;
  duration_ms?: number;
  timestamp?: string;
}

export interface Solution {
  status: SolutionStatus;
  summary: string;
  steps: SolutionStep[];
  solved_at: string | null;
  ai_model: string;
}
