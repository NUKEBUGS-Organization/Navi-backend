import mongoose from 'mongoose';

/**
 * Archiving is a soft delete: the record keeps its data but drops out of lists, dashboards and
 * rollups until an admin restores it. Older records have no `archivedAt` at all, and `null` matches
 * a missing field too, so always filter with these rather than `archivedAt: { $exists: false }`.
 */
export const NOT_ARCHIVED = { archivedAt: null } as const;
export const ONLY_ARCHIVED = { archivedAt: { $ne: null } } as const;

/** IDs of an organization's archived assessments. */
export async function findArchivedAssessmentIds(
  assessmentModel: mongoose.Model<any>,
  organizationId: mongoose.Types.ObjectId,
): Promise<mongoose.Types.ObjectId[]> {
  const docs = await assessmentModel
    .find({ organizationId, ...ONLY_ARCHIVED })
    .select('_id')
    .lean()
    .exec();
  return (docs as Array<{ _id: mongoose.Types.ObjectId }>).map((d) => d._id);
}

/** `assessmentId` filter that skips submissions to archived assessments. */
export function notInArchivedAssessments(archivedIds: mongoose.Types.ObjectId[]) {
  return archivedIds.length ? { assessmentId: { $nin: archivedIds } } : {};
}

/** `initiativeId` filter that skips records belonging to archived initiatives. */
export function notInArchivedInitiatives(archivedIds: mongoose.Types.ObjectId[]) {
  return archivedIds.length ? { initiativeId: { $nin: archivedIds } } : {};
}
