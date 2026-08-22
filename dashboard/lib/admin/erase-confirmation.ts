/**
 * Wording for the "delete everything about this learner" confirmation.
 *
 * The dialog has to name WHO, not only what. The likeliest mistake at this
 * button is not "I did not mean to delete" - it is "I had the wrong row open",
 * and a dialog that says "this learner" reads perfectly correct for the deletion
 * the operator meant to perform on somebody else. Naming her is what makes a
 * wrong-row click visible while it is still recoverable.
 *
 * Pure, so the exact strings an operator sees before an irreversible action are
 * covered by tests rather than by eye.
 */

export type EraseConfirmationCopy = {
  title: string;
  description: string;
};

/** What is lost. Constant across learners, so it lives here once. */
const CONSEQUENCES =
  "This cannot be undone. Her name, number, progress and quiz results will be deleted, along with any certificate and its public verification link. Records of airtime already paid are kept without her name or number, because they have to stay reconcilable with the airtime provider.";

export function eraseConfirmationCopy(
  name: string | null | undefined,
  phone: string
): EraseConfirmationCopy {
  const learnerName = (name ?? "").trim();
  const hasName = learnerName.length > 0;

  return {
    title: hasName
      ? `Delete everything about ${learnerName}?`
      : "Delete everything about this learner?",
    // Names repeat and the number does not, so the number is the identifier that
    // actually catches a wrong row - and it is what an operator holding a
    // deletion request has in front of them.
    description: `${hasName ? `${learnerName}, ${phone}` : `The learner on ${phone}`}. ${CONSEQUENCES}`
  };
}
