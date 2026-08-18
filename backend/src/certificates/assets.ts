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

export const loadAssetFromDb: AssetLoader = async (key) => {
  const row = await prisma.certificateAsset.findUnique({ where: { key } });
  if (!row) return null;
  return { bytes: Buffer.from(row.bytes), width: row.width, height: row.height };
};
