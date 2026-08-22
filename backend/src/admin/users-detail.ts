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
  /** Absent when she has not earned one. Deliberately carries no phone
   * number and no template snapshot: the drawer needs her status and a link
   * to the public page, nothing more. */
  certificate?: {
    id: string;
    publicId: string;
    learnerName: string;
    issuedAt: string;
    revokedAt: string | null;
  };
  /**
   * Her privacy decision, so an operator asked "did she agree, and to what?"
   * does not need a developer and a database client.
   *
   * `decision` is the latest answer and `noticeVersion` the version of the
   * notice she was shown when she gave it. The notice is editable, so the
   * version is what makes the answer mean anything. Absent for anyone who has
   * never been asked.
   */
  consent?: {
    decision: string;
    noticeVersion: number;
    language: string;
    decidedAt: string;
    /** How many times she has answered, ever. More than one means she changed
     * her mind, or was asked again after a material change to the notice. */
    decisionCount: number;
  };
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function getLearnerDetail(phone: string): Promise<LearnerDetail | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: {
      session: true,
      progress: true,
      quizAttempts: true,
      rewards: true,
      certificate: true,
      // Newest first: the drawer shows the decision that currently stands.
      consentEvents: { orderBy: { decidedAt: "desc" } }
    }
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
    })),
    // Conditional spread rather than a null field: the drawer renders this
    // row only when the key is present, and exactOptionalPropertyTypes
    // rejects an explicit undefined here.
    ...(user.certificate
      ? {
          certificate: {
            id: user.certificate.id,
            publicId: user.certificate.publicId,
            learnerName: user.certificate.learnerName,
            issuedAt: user.certificate.issuedAt.toISOString(),
            revokedAt: iso(user.certificate.revokedAt)
          }
        }
      : {}),
    ...(user.consentEvents.length > 0 && user.consentEvents[0]
      ? {
          consent: {
            decision: user.consentEvents[0].decision,
            noticeVersion: user.consentEvents[0].noticeVersion,
            language: user.consentEvents[0].language,
            decidedAt: user.consentEvents[0].decidedAt.toISOString(),
            decisionCount: user.consentEvents.length
          }
        }
      : {})
  };
}
