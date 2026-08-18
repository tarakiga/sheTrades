/**
 * The learners the template editor previews against.
 *
 * These live on the SERVER rather than in the dashboard for the same reason
 * everything else visible does: an admin who finds that no sample name breaks
 * the layout badly enough should be able to add one, and a list compiled into
 * the frontend bundle cannot be added to without a deploy. For now they are
 * static — moving them into a config document is a small change and not worth
 * making before anyone has asked.
 *
 * The point of the set is OVERFLOW. A layout signed off against "Ada Obi" and
 * then met with a 54-character hyphenated name produces a certificate with the
 * learner's own name running off the artwork, permanently, in her hands. So the
 * list deliberately spans the range the sanitiser actually admits: short,
 * ordinary, all-capitals (which is wider per character than it looks), accented
 * (which is taller), and long enough to test the shrink.
 */
export type CertificatePreviewSample = {
  id: string;
  label: string;
  learnerName: string;
};

export const CERTIFICATE_PREVIEW_SAMPLES: ReadonlyArray<CertificatePreviewSample> = [
  { id: "typical", label: "A typical name", learnerName: "Adaeze Okonkwo" },
  { id: "short", label: "A short name", learnerName: "Ada Obi" },
  {
    id: "capitals",
    label: "All capitals",
    // Capitals are meaningfully wider per character than lower case, so a name
    // entered in caps is the common way a box that looked fine overflows.
    learnerName: "NGOZI CHIMAMANDA ADICHIE"
  },
  {
    id: "accented",
    label: "Accented characters",
    // Yoruba diacritics sit below the baseline; a box tight to the descender
    // clips them, and the learner sees her name spelled wrong.
    learnerName: "Olabisi Adeyemi-Babatunde"
  },
  {
    id: "long",
    label: "A very long name",
    learnerName: "Oluwafunmilayo Adebayo-Ogundimu-Chukwuemeka Ifeoluwapo"
  }
];

export const DEFAULT_PREVIEW_SAMPLE_ID = "typical";

export function findPreviewSample(id: string | undefined): CertificatePreviewSample {
  const wanted = id ?? DEFAULT_PREVIEW_SAMPLE_ID;
  return (
    CERTIFICATE_PREVIEW_SAMPLES.find((sample) => sample.id === wanted) ??
    // An unknown id falls back rather than failing: the preview is a sighting
    // aid, and refusing to draw anything because a dropdown drifted out of
    // sync would be a worse answer than drawing the ordinary case.
    CERTIFICATE_PREVIEW_SAMPLES[0]!
  );
}
