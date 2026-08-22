import { prisma } from "../admin/prisma.js";
import { ERASURE_ORDER, generateRequestRef } from "./core.js";

/**
 * Erasing a participant on request.
 *
 * One transaction, or nothing. A partial erasure is worse than none, because it
 * reports success: the participant is told her information is gone, and some of
 * it is not.
 *
 * What survives, deliberately, is the rewards ledger in de-identified form.
 * Money that actually moved has to stay reconcilable against the airtime
 * provider's records, and that obligation outlives her request. What survives
 * of it carries no name, no phone and no user id.
 */

export type ErasureOutcome =
  | { status: "erased"; requestRef: string; counts: Record<string, number> }
  | { status: "not_found" }
  | { status: "failed"; reason: string };

export type EraseInput = {
  phone: string;
  requestedVia: "bot" | "admin";
  /** The admin who ran it. Null on the bot path, where naming the actor would
   * mean naming the person the log exists NOT to identify. */
  actorId?: string | null;
};

export async function eraseParticipant(input: EraseInput): Promise<ErasureOutcome> {
  const phone = input.phone.trim();
  if (phone.length === 0) return { status: "not_found" };

  try {
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true }
    });
    if (!user) return { status: "not_found" };

    const requestRef = generateRequestRef();

    const counts = await prisma.$transaction(async (tx) => {
      const removed: Record<string, number> = {};

      // Copy before deleting. If this throws, the transaction rolls back and
      // the rewards are still there — the opposite order would lose the
      // financial record on any failure downstream.
      const rewards = await tx.reward.findMany({ where: { userId: user.id } });
      if (rewards.length > 0) {
        await tx.rewardArchive.createMany({
          data: rewards.map((reward) => ({
            module: reward.module,
            amount: reward.amount,
            channel: reward.channel,
            status: reward.status,
            issuedAt: reward.issuedAt,
            providerTxnId: reward.providerTxnId
          }))
        });
      }
      removed.reward_archive = rewards.length;

      for (const table of ERASURE_ORDER) {
        switch (table) {
          case "certificates":
            removed[table] = (await tx.certificate.deleteMany({ where: { userId: user.id } })).count;
            break;
          case "rewards":
            removed[table] = (await tx.reward.deleteMany({ where: { userId: user.id } })).count;
            break;
          case "quiz_attempts":
            removed[table] = (await tx.quizAttempt.deleteMany({ where: { userId: user.id } })).count;
            break;
          case "user_progress":
            removed[table] = (await tx.userProgress.deleteMany({ where: { userId: user.id } })).count;
            break;
          case "consent_events":
            removed[table] = (await tx.consentEvent.deleteMany({ where: { userId: user.id } })).count;
            break;
          case "user_sessions":
            removed[table] = (await tx.userSession.deleteMany({ where: { userId: user.id } })).count;
            break;
          case "outbound_messages":
            // By PHONE, not by userId: this table has no foreign key to users,
            // so nothing else in this transaction would touch it and nothing
            // would complain if it were forgotten.
            removed[table] = (await tx.outboundMessage.deleteMany({ where: { phone: user.phone } })).count;
            break;
          case "users":
            removed[table] = (await tx.user.deleteMany({ where: { id: user.id } })).count;
            break;
        }
      }

      // Written last and inside the transaction: a log claiming an erasure that
      // rolled back would be worse than no log at all.
      await tx.erasureLog.create({
        data: {
          requestRef,
          requestedVia: input.requestedVia,
          actorId: input.actorId ?? null,
          tableCounts: removed
        }
      });

      return removed;
    });

    // No phone, no name, no id — the same rule the log follows. The reference
    // is enough to correlate this line with the row if anyone ever needs to.
    console.log(
      JSON.stringify({
        event: "privacy.erasure.completed",
        requestRef,
        requestedVia: input.requestedVia,
        counts,
        completedAt: new Date().toISOString()
      })
    );

    return { status: "erased", requestRef, counts };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        event: "privacy.erasure.failed",
        requestedVia: input.requestedVia,
        reason,
        failedAt: new Date().toISOString()
      })
    );
    return { status: "failed", reason };
  }
}
