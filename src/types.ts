/**
 * Core TypeScript types for spectacular-codex MCP server.
 *
 * This module defines the strict type interfaces for execution jobs, tasks, phases,
 * and plans. All types use strict mode with union types for status fields.
 *
 * @module types
 */

/**
 * Stacking backend strategies for organizing task branches.
 */
export type StackingBackend = 'git-spice' | 'gh-stack' | 'graphite';

/**
 * Execution job status.
 * - running: Execution in progress
 * - completed: All phases and tasks completed successfully
 * - failed: Execution failed with error
 */
export type JobStatus = 'running' | 'completed' | 'failed';

/**
 * Phase execution strategy.
 * - parallel: Tasks execute concurrently via Promise.all()
 * - sequential: Tasks execute one-by-one in order
 */
export type PhaseStrategy = 'parallel' | 'sequential';

/**
 * A single task within a phase.
 */
export interface Task {
  /** Task identifier (e.g., "1-1", "2-3") */
  id: string;

  /** Human-readable task name */
  name: string;

  /** Task description */
  description: string;

  /** Task dependencies (task IDs this task depends on) */
  dependencies?: string[];

  /** List of files this task modifies/creates */
  files: string[];

  /** Acceptance criteria for task completion */
  acceptanceCriteria: string[];

  /** Git branch created for this task (populated after execution) */
  branch?: string;
}

/**
 * A phase containing one or more tasks.
 */
export interface Phase {
  /** Phase number (1-based) */
  id: number;

  /** Human-readable phase name */
  name: string;

  /** Execution strategy (parallel or sequential) */
  strategy: PhaseStrategy;

  /** Tasks within this phase */
  tasks: Task[];
}

/**
 * Implementation plan parsed from plan.md.
 */
export interface Plan {
  /** Unique run identifier (6-char hex) */
  runId: string;

  /** Feature slug from spec directory */
  featureSlug: string;

  /** Optional plan title */
  title?: string;

  /** Phases to execute */
  phases: Phase[];

  /** Branch stacking backend to use */
  stackingBackend: StackingBackend;
}

/**
 * In-memory execution job state.
 *
 * This tracks real-time status for polling. Git branches are source of truth
 * for persistence and resume logic.
 */
export interface ExecutionJob {
  /** Unique run identifier matching Plan.runId */
  runId: string;

  /** Current job status */
  status: JobStatus;

  /** Current phase being executed (1-based) */
  phase: number;

  /** Total number of phases in plan */
  totalPhases: number;

  /** Task completion status */
  tasks: Array<{
    /** Task ID */
    id: string;
    /** Task status */
    status: 'pending' | 'running' | 'completed' | 'failed';
    /** Branch name if completed */
    branch?: string;
    /** Error message if failed */
    error?: string;
  }>;

  /** Job start timestamp */
  startedAt: Date;

  /** Job completion timestamp (if completed or failed) */
  completedAt?: Date;

  /** Error message (if status is 'failed') */
  error?: string;
}

/**
 * Result from a Codex thread execution.
 */
export interface CodexThreadResult {
  /** Whether task execution succeeded */
  success: boolean;

  /** Task ID that was executed */
  taskId: string;

  /** Branch name created (if success) */
  branch?: string;

  /** Error message (if failure) */
  error?: string;
}

/**
 * A completed task with branch information.
 */
export interface CompletedTask extends Task {
  /** Branch name for this completed task */
  branch: string;

  /** Number of commits in the branch */
  commitCount: number;
}

/**
 * Result of checking existing work for a phase.
 */
export interface ExistingWork {
  /** Tasks that are already completed */
  completedTasks: CompletedTask[];

  /** Tasks that still need to be executed */
  pendingTasks: Task[];
}
