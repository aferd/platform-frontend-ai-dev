export interface Task {
  id: number;
  jira_key: string;
  status: 'in_progress' | 'pr_open' | 'pr_changes' | 'paused' | 'done';
  repo: string;
  branch: string;
  pr_number: number | null;
  pr_url: string | null;
  title: string | null;
  summary: string | null;
  created_at: string;
  last_addressed: string;
  paused_reason: string | null;
  metadata: Record<string, any>;
}

export interface Memory {
  id: number;
  category: string;
  repo: string;
  jira_key: string | null;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  metadata: Record<string, any>;
  similarity?: number;
}

export interface BotStatus {
  state: 'working' | 'idle' | 'error' | 'unknown';
  message: string;
  jira_key: string | null;
  repo: string | null;
  cycle_start: string | null;
  updated_at: string;
}

export interface CycleEntry {
  id: number;
  timestamp: string;
  label: string;
  session_id: string;
  num_turns: number;
  duration_ms: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  model: string;
  is_error: boolean;
  no_work: boolean;
  jira_key: string | null;
  repo: string | null;
  work_type: string | null;
  summary: string | null;
}

export interface DailyAggregate {
  day: string;
  cycles: number;
  total_cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  total_duration: number;
  total_turns: number;
  idle_cycles: number;
  error_cycles: number;
}

export interface EmbeddingPoint {
  id: number;
  title: string;
  content: string;
  category: string;
  repo: string;
  tags: string[];
  x: number;
  y: number;
  z: number;
}

export interface WSEvent {
  type: string;
  data: any;
  timestamp: number;
}
