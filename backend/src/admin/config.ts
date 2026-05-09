import { z } from "zod";

const providerModeSchema = z.enum(["postgres", "firestore", "hybrid"]);
const analyticsStrategySchema = z.enum(["snapshot", "live"]);
const sqlIdentifierSchema = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/, "Invalid SQL identifier");
const sqlColumnIdentifierSchema = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Invalid SQL column identifier");
const firestorePathSegmentSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid Firestore collection/doc identifier");
const nonEmptyStringSchema = z.string().min(1, "Expected a non-empty string");
const intStringSchema = z.coerce.number().int().positive();

const postgresMappingsSchema = z.object({
  usersView: sqlIdentifierSchema.default("admin_users_view"),
  analyticsSnapshotTable: sqlIdentifierSchema.default("admin_analytics_snapshot"),
  usersTable: sqlIdentifierSchema.default("users"),
  progressTable: sqlIdentifierSchema.default("user_progress"),
  quizAttemptsTable: sqlIdentifierSchema.default("quiz_attempts"),
  usersIdColumn: sqlColumnIdentifierSchema.default("id"),
  usersLocationColumn: sqlColumnIdentifierSchema.default("location"),
  progressUserIdColumn: sqlColumnIdentifierSchema.default("user_id"),
  progressCompletionColumn: sqlColumnIdentifierSchema.default("module_completion_pct"),
  quizUserIdColumn: sqlColumnIdentifierSchema.default("user_id"),
  quizPassedColumn: sqlColumnIdentifierSchema.default("passed"),
  contentView: sqlIdentifierSchema.default("admin_content_view"),
  rewardsView: sqlIdentifierSchema.default("admin_rewards_view"),
  reportsView: sqlIdentifierSchema.default("admin_reports_view")
});

const firestoreMappingsSchema = z.object({
  usersCollection: firestorePathSegmentSchema.default("admin_users"),
  analyticsCollection: firestorePathSegmentSchema.default("admin_analytics"),
  analyticsDocId: firestorePathSegmentSchema.default("latest"),
  liveUsersCollection: firestorePathSegmentSchema.default("users"),
  liveStartedField: firestorePathSegmentSchema.default("has_started"),
  liveCompletedField: firestorePathSegmentSchema.default("has_completed"),
  livePassedField: firestorePathSegmentSchema.default("has_passed"),
  liveLocationField: firestorePathSegmentSchema.default("location"),
  anambraLocationValue: nonEmptyStringSchema.default("Anambra"),
  deltaLocationValue: nonEmptyStringSchema.default("Delta"),
  contentCollection: firestorePathSegmentSchema.default("admin_content"),
  rewardsCollection: firestorePathSegmentSchema.default("admin_rewards"),
  reportsCollection: firestorePathSegmentSchema.default("admin_reports")
});

const dataAccessPolicySchema = z.object({
  queryTimeoutMs: intStringSchema.default(3000),
  statementTimeoutMs: intStringSchema.default(3000),
  connectTimeoutMs: intStringSchema.default(3000),
  retryAttempts: intStringSchema.default(2),
  retryDelayMs: intStringSchema.default(200)
});

export function getProviderMode() {
  const configured = process.env.ADMIN_DATA_PROVIDER;
  if (!configured) {
    return "hybrid" as const;
  }
  const parsed = providerModeSchema.safeParse(configured);
  if (!parsed.success) {
    throw new Error("Invalid ADMIN_DATA_PROVIDER. Use postgres | firestore | hybrid.");
  }
  return parsed.data;
}

export function getPostgresMappings() {
  return postgresMappingsSchema.parse({
    usersView: process.env.PG_ADMIN_USERS_VIEW,
    analyticsSnapshotTable: process.env.PG_ADMIN_ANALYTICS_TABLE,
    usersTable: process.env.PG_USERS_TABLE,
    progressTable: process.env.PG_PROGRESS_TABLE,
    quizAttemptsTable: process.env.PG_QUIZ_ATTEMPTS_TABLE,
    usersIdColumn: process.env.PG_USERS_ID_COLUMN,
    usersLocationColumn: process.env.PG_USERS_LOCATION_COLUMN,
    progressUserIdColumn: process.env.PG_PROGRESS_USER_ID_COLUMN,
    progressCompletionColumn: process.env.PG_PROGRESS_COMPLETION_COLUMN,
    quizUserIdColumn: process.env.PG_QUIZ_USER_ID_COLUMN,
    quizPassedColumn: process.env.PG_QUIZ_PASSED_COLUMN,
    contentView: process.env.PG_ADMIN_CONTENT_VIEW,
    rewardsView: process.env.PG_ADMIN_REWARDS_VIEW,
    reportsView: process.env.PG_ADMIN_REPORTS_VIEW
  });
}

export function getFirestoreMappings() {
  return firestoreMappingsSchema.parse({
    usersCollection: process.env.FS_ADMIN_USERS_COLLECTION,
    analyticsCollection: process.env.FS_ADMIN_ANALYTICS_COLLECTION,
    analyticsDocId: process.env.FS_ADMIN_ANALYTICS_DOC_ID,
    liveUsersCollection: process.env.FS_LIVE_USERS_COLLECTION,
    liveStartedField: process.env.FS_LIVE_STARTED_FIELD,
    liveCompletedField: process.env.FS_LIVE_COMPLETED_FIELD,
    livePassedField: process.env.FS_LIVE_PASSED_FIELD,
    liveLocationField: process.env.FS_LIVE_LOCATION_FIELD,
    anambraLocationValue: process.env.FS_LOCATION_VALUE_ANAMBRA,
    deltaLocationValue: process.env.FS_LOCATION_VALUE_DELTA,
    contentCollection: process.env.FS_ADMIN_CONTENT_COLLECTION,
    rewardsCollection: process.env.FS_ADMIN_REWARDS_COLLECTION,
    reportsCollection: process.env.FS_ADMIN_REPORTS_COLLECTION
  });
}

export function getDataAccessPolicy() {
  return dataAccessPolicySchema.parse({
    queryTimeoutMs: process.env.ADMIN_QUERY_TIMEOUT_MS,
    statementTimeoutMs: process.env.ADMIN_STATEMENT_TIMEOUT_MS,
    connectTimeoutMs: process.env.ADMIN_CONNECT_TIMEOUT_MS,
    retryAttempts: process.env.ADMIN_RETRY_ATTEMPTS,
    retryDelayMs: process.env.ADMIN_RETRY_DELAY_MS
  });
}

export function isProductionMode() {
  return process.env.NODE_ENV === "production";
}

export function isForcedEmptyDataMode() {
  return process.env.ADMIN_FORCE_EMPTY_DATA === "true";
}

export function getAnalyticsStrategy() {
  const configured = process.env.ADMIN_ANALYTICS_STRATEGY;
  if (!configured) {
    return "snapshot" as const;
  }
  const parsed = analyticsStrategySchema.safeParse(configured);
  if (!parsed.success) {
    throw new Error("Invalid ADMIN_ANALYTICS_STRATEGY. Use snapshot | live.");
  }
  return parsed.data;
}
