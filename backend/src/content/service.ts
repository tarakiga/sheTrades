import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ContentAdminRow, LessonRecord } from "./contracts.js";

const questionSchema = z
  .object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    answerIndex: z.number().int().min(0)
  })
  .superRefine((value, ctx) => {
    if (value.answerIndex >= value.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "answerIndex must reference an option index."
      });
    }
  });

const lessonCreateSchema = z.object({
  moduleId: z.number().int().positive(),
  title: z.string().min(1),
  languages: z.object({
    en: z.string().min(1),
    pcm: z.string().optional(),
    ig: z.string().optional()
  }),
  audioUrls: z
    .object({
      en: z.string().url().optional(),
      pcm: z.string().url().optional(),
      ig: z.string().url().optional()
    })
    .default({}),
  quiz: z.array(questionSchema).min(1)
});

const lessonUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  languages: z
    .object({
      en: z.string().min(1).optional(),
      pcm: z.string().optional(),
      ig: z.string().optional()
    })
    .optional(),
  audioUrls: z
    .object({
      en: z.string().url().optional(),
      pcm: z.string().url().optional(),
      ig: z.string().url().optional()
    })
    .optional(),
  quiz: z.array(questionSchema).min(1).optional()
});

const lessonValidateSchema = lessonCreateSchema.extend({
  id: z.string().min(1).optional(),
  status: z.enum(["Draft", "Published"]).optional()
});

type LessonCreateInput = z.infer<typeof lessonCreateSchema>;
type LessonUpdateInput = z.infer<typeof lessonUpdateSchema>;
type LessonValidateInput = z.infer<typeof lessonValidateSchema>;

const lessonStore = new Map<string, LessonRecord>();

function nowIso() {
  return new Date().toISOString();
}

function normalizeLanguages(input: {
  en: string;
  pcm?: string | undefined;
  ig?: string | undefined;
}) {
  return {
    en: input.en,
    ...(input.pcm !== undefined ? { pcm: input.pcm } : {}),
    ...(input.ig !== undefined ? { ig: input.ig } : {})
  };
}

function normalizeAudioUrls(input: {
  en?: string | undefined;
  pcm?: string | undefined;
  ig?: string | undefined;
}) {
  return {
    ...(input.en !== undefined ? { en: input.en } : {}),
    ...(input.pcm !== undefined ? { pcm: input.pcm } : {}),
    ...(input.ig !== undefined ? { ig: input.ig } : {})
  };
}

function normalizeLanguagePatch(input: {
  en?: string | undefined;
  pcm?: string | undefined;
  ig?: string | undefined;
}) {
  return {
    ...(input.en !== undefined ? { en: input.en } : {}),
    ...(input.pcm !== undefined ? { pcm: input.pcm } : {}),
    ...(input.ig !== undefined ? { ig: input.ig } : {})
  };
}

function ensureSeedData() {
  if (lessonStore.size > 0) return;
  const seedA: LessonRecord = {
    id: "lesson-001",
    moduleId: 1,
    title: "Pricing Basics",
    languages: {
      en: "How to calculate cost and margin.",
      pcm: "How to calculate your cost and gain."
    },
    audioUrls: {},
    quiz: [
      {
        question: "What is profit?",
        options: ["Revenue minus cost", "Revenue plus cost"],
        answerIndex: 0
      }
    ],
    status: "Published",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const seedB: LessonRecord = {
    id: "lesson-002",
    moduleId: 2,
    title: "Record Keeping",
    languages: {
      en: "Track daily sales and expenses."
    },
    audioUrls: {},
    quiz: [
      {
        question: "Why keep records?",
        options: ["To guess performance", "To track business health"],
        answerIndex: 1
      }
    ],
    status: "Draft",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  lessonStore.set(seedA.id, seedA);
  lessonStore.set(seedB.id, seedB);
}

export function listLessons() {
  ensureSeedData();
  return Array.from(lessonStore.values()).sort((a, b) => {
    if (a.moduleId !== b.moduleId) return a.moduleId - b.moduleId;
    return a.title.localeCompare(b.title);
  });
}

export function createLesson(rawInput: unknown) {
  const input = lessonCreateSchema.parse(rawInput);
  const lesson: LessonRecord = {
    id: randomUUID(),
    moduleId: input.moduleId,
    title: input.title,
    languages: normalizeLanguages(input.languages),
    audioUrls: normalizeAudioUrls(input.audioUrls ?? {}),
    quiz: input.quiz,
    status: "Draft",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  lessonStore.set(lesson.id, lesson);
  return lesson;
}

export function updateLesson(lessonId: string, rawInput: unknown) {
  const input = lessonUpdateSchema.parse(rawInput);
  const existing = lessonStore.get(lessonId);
  if (!existing) return null;

  const updated: LessonRecord = {
    ...existing,
    ...(input.title ? { title: input.title } : {}),
    ...(input.languages
      ? { languages: { ...existing.languages, ...normalizeLanguagePatch(input.languages) } }
      : {}),
    ...(input.audioUrls
      ? { audioUrls: { ...existing.audioUrls, ...normalizeAudioUrls(input.audioUrls) } }
      : {}),
    ...(input.quiz ? { quiz: input.quiz } : {}),
    updatedAt: nowIso()
  };
  lessonStore.set(lessonId, updated);
  return updated;
}

export function publishLesson(lessonId: string) {
  const existing = lessonStore.get(lessonId);
  if (!existing) return null;

  lessonCreateSchema.parse({
    moduleId: existing.moduleId,
    title: existing.title,
    languages: existing.languages,
    audioUrls: existing.audioUrls,
    quiz: existing.quiz
  });

  const published: LessonRecord = {
    ...existing,
    status: "Published",
    updatedAt: nowIso()
  };
  lessonStore.set(lessonId, published);
  return published;
}

export function validateLesson(rawInput: unknown) {
  const parsed = lessonValidateSchema.safeParse(rawInput);
  if (parsed.success) {
    return { valid: true as const, errors: [] as string[] };
  }
  return {
    valid: false as const,
    errors: parsed.error.issues.map((issue) => issue.message)
  };
}

export function listLessonsForAdmin(): { lessons: ContentAdminRow[] } {
  const lessons = listLessons().map((lesson) => {
    const languages = [
      lesson.languages.en ? "EN" : "",
      lesson.languages.pcm ? "PCM" : "",
      lesson.languages.ig ? "IG" : ""
    ]
      .filter(Boolean)
      .join("/");
    return {
      module: `Module ${lesson.moduleId}`,
      lesson: lesson.title,
      language: languages || "EN",
      quiz: `${lesson.quiz.length} questions`,
      status: lesson.status
    };
  });
  return { lessons };
}

export function resetContentServiceState() {
  lessonStore.clear();
}

export {
  lessonCreateSchema,
  lessonUpdateSchema,
  type LessonCreateInput,
  type LessonUpdateInput,
  type LessonValidateInput
};
