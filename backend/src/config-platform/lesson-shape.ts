/**
 * A lesson payload as published config hands it over: the SHAPE is expected,
 * the CONTENTS are not trusted. Every field is `unknown` because content
 * published before today's validation existed is still in the database, and
 * the translation code narrows each value at the point of use rather than
 * assuming.
 *
 * This replaces `lesson: any` across the translation module. `any` said the
 * same thing but switched the compiler off; this keeps it on.
 */
export type LessonLike = {
  title?: unknown;
  module?: unknown;
  languages?: { en?: unknown; pcm?: unknown; ig?: unknown } | null;
  audioUrls?: unknown;
  quiz?: unknown;
  [key: string]: unknown;
};

export type QuizItemLike = {
  question?: unknown;
  options?: unknown;
  answerIndex?: unknown;
  [key: string]: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The quiz items, INDEX-PRESERVING. Unit ids encode position (`q2.opt1`) and
 * the draft is reassembled by those ids, so a malformed entry must keep its
 * slot rather than shift everything after it; it becomes an empty item that
 * yields no units.
 */
export function quizItemsOf(lesson: LessonLike | null | undefined): QuizItemLike[] {
  const quiz = lesson?.quiz;
  if (!Array.isArray(quiz)) return [];
  return quiz.map((item): QuizItemLike => (isRecord(item) ? item : {}));
}

export function optionsOf(item: QuizItemLike): unknown[] {
  return Array.isArray(item.options) ? item.options : [];
}
