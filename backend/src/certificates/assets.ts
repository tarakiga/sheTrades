import { prisma } from "../admin/prisma.js";

export type LoadedAsset = { bytes: Buffer; width: number; height: number };

/**
 * Injected into the renderer so it can be tested without a database.
 *
 * Returns null (rather than throwing) for a key that does not exist: "this
 * asset is absent" is a fact the renderer has to make a policy decision about,
 * and that decision belongs with the renderer -- which knows whether the
 * missing asset is the background of the whole credential or one partner mark.
 */
export type AssetLoader = (key: string) => Promise<LoadedAsset | null>;

/**
 * ASSET KEYS ARE IMMUTABLE. This is the seam where a frozen template stops
 * being self-contained.
 *
 * A certificate row carries the whole template payload (Certificate.
 * templateSnapshot) so a republished redesign cannot rewrite artwork already
 * delivered. But the snapshot holds asset KEYS, not asset BYTES -- a 2000x1414
 * background is not something to copy onto every learner's row -- and
 * certificate_assets is keyed on `key` with an upsert-shaped seeding path. So
 * re-seeding "cert-bg" with a new image silently changes every certificate that
 * ever referenced it, straight through the snapshot.
 *
 * The rule that keeps the snapshot meaningful: VERSION THE KEY rather than
 * replace its bytes. A new background is "cert-bg-v3" seeded alongside
 * "cert-bg-v2", published as a new template revision; old rows keep pointing at
 * the old key and keep rendering what they were issued as. Never overwrite the
 * bytes behind a key that any issued certificate might reference.
 */

export const loadAssetFromDb: AssetLoader = async (key) => {
  const row = await prisma.certificateAsset.findUnique({ where: { key } });
  if (!row) return null;
  return { bytes: Buffer.from(row.bytes), width: row.width, height: row.height };
};
