import { z } from "zod";

const LESSONS_PER_MODULE = 3;
const QUIZ_PASS_PERCENT = 70;

type ModuleProgress = {
  completedLessons: number[];
  quizAttempts: number;
  latestQuizScore?: number;
  passed: boolean;
  completed: boolean;
};

export type UserLearningState = {
  phone: string;
  progress: Record<string, number>;
  modules: Record<string, ModuleProgress>;
  rewards: Array<{ module: number; amount: number; date: string }>;
  updatedAt: string;
};

const lessonCompletionEventSchema = z.object({
  type: z.literal("lesson_completed"),
  moduleId: z.number().int().positive(),
  lessonId: z.number().int().min(1).max(LESSONS_PER_MODULE)
});

const quizSubmissionEventSchema = z.object({
  type: z.literal("quiz_submitted"),
  moduleId: z.number().int().positive(),
  selectedAnswers: z.array(z.number().int().min(0)),
  answerKey: z.array(z.number().int().min(0)).min(1)
});

const progressUpdateSchema = z.object({
  phone: z.string().min(1),
  updateId: z.string().min(1),
  event: z.discriminatedUnion("type", [lessonCompletionEventSchema, quizSubmissionEventSchema])
});

export type ProgressUpdateInput = z.infer<typeof progressUpdateSchema>;

export type ProgressUpdateResult = {
  status: "applied" | "duplicate" | "no_op";
  reason?: string;
  state: UserLearningState;
};

const userStateStore = new Map<string, UserLearningState>();
const processedUpdateIdsByPhone = new Map<string, Set<string>>();

function nowIso() {
  return new Date().toISOString();
}

function moduleKey(moduleId: number) {
  return `module${moduleId}`;
}

function ensureModule(state: UserLearningState, moduleId: number): ModuleProgress {
  const key = moduleKey(moduleId);
  const existing = state.modules[key];
  if (existing) return existing;

  const created: ModuleProgress = {
    completedLessons: [],
    quizAttempts: 0,
    passed: false,
    completed: false
  };
  state.modules[key] = created;
  if (!(key in state.progress)) {
    state.progress[key] = 0;
  }
  return created;
}

function ensureUserState(phone: string): UserLearningState {
  const existing = userStateStore.get(phone);
  if (existing) return existing;

  const created: UserLearningState = {
    phone,
    progress: {},
    modules: {},
    rewards: [],
    updatedAt: nowIso()
  };
  userStateStore.set(phone, created);
  return created;
}

function finalizeProgress(state: UserLearningState, moduleId: number) {
  const key = moduleKey(moduleId);
  const module = ensureModule(state, moduleId);
  const lessonProgress = Math.round((module.completedLessons.length / LESSONS_PER_MODULE) * 70);
  const quizProgress = module.passed ? 30 : 0;
  state.progress[key] = Math.min(100, lessonProgress + quizProgress);
  module.completed = state.progress[key] >= 100;
  state.updatedAt = nowIso();
}

function isDuplicate(phone: string, updateId: string) {
  const seen = processedUpdateIdsByPhone.get(phone);
  return Boolean(seen?.has(updateId));
}

function markProcessed(phone: string, updateId: string) {
  const seen = processedUpdateIdsByPhone.get(phone) ?? new Set<string>();
  seen.add(updateId);
  processedUpdateIdsByPhone.set(phone, seen);
}

export function getUserLearningState(phone: string): UserLearningState {
  return ensureUserState(phone);
}

export function applyProgressUpdate(rawInput: unknown): ProgressUpdateResult {
  const input = progressUpdateSchema.parse(rawInput);
  const state = ensureUserState(input.phone);
  const module = ensureModule(state, input.event.moduleId);

  if (isDuplicate(input.phone, input.updateId)) {
    return { status: "duplicate", reason: "Update id already processed.", state };
  }

  if (input.event.type === "lesson_completed") {
    const expectedNextLesson = module.completedLessons.length + 1;
    if (input.event.lessonId !== expectedNextLesson) {
      if (module.completedLessons.includes(input.event.lessonId)) {
        markProcessed(input.phone, input.updateId);
        return { status: "no_op", reason: "Lesson was already completed.", state };
      }
      return {
        status: "no_op",
        reason: `Invalid lesson sequence. Expected lesson ${expectedNextLesson}.`,
        state
      };
    }

    module.completedLessons.push(input.event.lessonId);
    finalizeProgress(state, input.event.moduleId);
    markProcessed(input.phone, input.updateId);
    return { status: "applied", state };
  }

  if (module.completedLessons.length < LESSONS_PER_MODULE) {
    return {
      status: "no_op",
      reason: "Cannot submit quiz before all lessons are completed.",
      state
    };
  }

  const quizEvent = input.event;
  const total = quizEvent.answerKey.length;
  const matches = quizEvent.answerKey.reduce((acc, answer, index) => {
    return acc + (quizEvent.selectedAnswers[index] === answer ? 1 : 0);
  }, 0);
  const score = Math.round((matches / total) * 100);

  module.quizAttempts += 1;
  module.latestQuizScore = score;
  module.passed = score >= QUIZ_PASS_PERCENT;

  if (module.passed && !state.rewards.some((r) => r.module === input.event.moduleId)) {
    state.rewards.push({
      module: input.event.moduleId,
      amount: 200,
      date: nowIso()
    });
  }

  finalizeProgress(state, input.event.moduleId);
  markProcessed(input.phone, input.updateId);
  return { status: "applied", state };
}

export function resetLearningEngineState() {
  userStateStore.clear();
  processedUpdateIdsByPhone.clear();
}
