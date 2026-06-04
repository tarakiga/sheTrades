import { prisma } from "./prisma.js";

export type LearnerDetail = {
  identity: {
    id: string;
    name: string | null;
    phone: string;
    location: string | null;
    language: string | null;
    status: string;
    flaggedForFollowUp: boolean;
    followUpNote: string | null;
    createdAt: string;
  };
  session: {
    state: string | null;
    currentLessonKey: string | null;
    completedLessons: string[];
    lastUpdatedAt: string | null;
  } | null;
  progress: Array<{ module: string; completionPercentage: number; updatedAt: string }>;
  quizAttempts: Array<{ lessonKey: string; passed: boolean; attemptCount: number; lastAttemptAt: string }>;
  rewards: Array<{ id: string; module: string; amount: number; channel: string; status: string; issuedAt: string | null; createdAt: string }>;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function getLearnerDetail(phone: string): Promise<LearnerDetail | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { session: true, progress: true, quizAttempts: true, rewards: true }
  });
  if (!user) return null;

  return {
    identity: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      location: user.location,
      language: user.language,
      status: user.status,
      flaggedForFollowUp: user.flaggedForFollowUp,
      followUpNote: user.followUpNote,
      createdAt: user.createdAt.toISOString()
    },
    session: user.session
      ? {
          state: user.session.state,
          currentLessonKey: user.session.currentLessonKey,
          completedLessons: user.session.completedLessons,
          lastUpdatedAt: iso(user.session.lastUpdatedAt)
        }
      : null,
    progress: user.progress.map((p) => ({
      module: p.module,
      completionPercentage: p.completionPercentage,
      updatedAt: p.updatedAt.toISOString()
    })),
    quizAttempts: user.quizAttempts.map((q) => ({
      lessonKey: q.lessonKey,
      passed: q.passed,
      attemptCount: q.attemptCount,
      lastAttemptAt: q.lastAttemptAt.toISOString()
    })),
    rewards: user.rewards.map((r) => ({
      id: r.id,
      module: r.module,
      amount: r.amount,
      channel: r.channel,
      status: r.status,
      issuedAt: iso(r.issuedAt),
      createdAt: r.createdAt.toISOString()
    }))
  };
}
