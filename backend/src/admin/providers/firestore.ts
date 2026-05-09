import { Firestore } from "@google-cloud/firestore";
import type {
  AnalyticsPageData,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "../contracts.js";
import { getFirestoreMappings } from "../config.js";
import { getAnalyticsStrategy } from "../config.js";
import { getDataAccessPolicy } from "../config.js";
import { logger } from "../../lib/logging.js";
import { withRetry } from "../../lib/retry.js";
import {
  normalizeLiveAggregateRow,
  toAnalyticsPageDataFromLiveAggregate
} from "./analytics-live.js";

let firestore: Firestore | null = null;

function getFirestore(): Firestore | null {
  const projectId = process.env.FIRESTORE_PROJECT_ID;
  if (!projectId) {
    return null;
  }
  if (!firestore) {
    firestore = new Firestore({ projectId });
  }
  return firestore;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Firestore operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    })
  ]);
}

function isRetryableFirestoreError(error: unknown) {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return true;
  }
  const code = Number((error as { code?: number }).code);
  return code === 4 || code === 10 || code === 13 || code === 14;
}

export async function fetchUsersFromFirestore(): Promise<UsersPageData | null> {
  const mappings = getFirestoreMappings();
  const db = getFirestore();
  if (!db) return null;
  const policy = getDataAccessPolicy();

  try {
    const snapshot = await withRetry(
      () =>
        withTimeout(
          db.collection(mappings.usersCollection).limit(200).get(),
          policy.queryTimeoutMs
        ),
      policy.retryAttempts,
      policy.retryDelayMs,
      isRetryableFirestoreError
    );
    const users = snapshot.docs.map((doc) => doc.data()) as UsersPageData["users"];
    return { users };
  } catch (error) {
    logger.error("admin.firestore.users_failed", error, {
      collection: mappings.usersCollection
    });
    throw error;
  }
}

export async function fetchAnalyticsFromFirestore(): Promise<AnalyticsPageData | null> {
  const mappings = getFirestoreMappings();
  const db = getFirestore();
  if (!db) return null;
  const policy = getDataAccessPolicy();
  const strategy = getAnalyticsStrategy();

  try {
    if (strategy === "live") {
      const usersCollection = db.collection(mappings.liveUsersCollection);
      const [
        registeredCountSnap,
        startedCountSnap,
        completedCountSnap,
        attemptedCountSnap,
        passedCountSnap,
        anambraRegisteredCountSnap,
        anambraCompletedCountSnap,
        anambraPassedCountSnap,
        deltaRegisteredCountSnap,
        deltaCompletedCountSnap,
        deltaPassedCountSnap
      ] = await withRetry(
        () =>
          withTimeout(
            Promise.all([
              usersCollection.count().get(),
              usersCollection.where(mappings.liveStartedField, "==", true).count().get(),
              usersCollection.where(mappings.liveCompletedField, "==", true).count().get(),
              usersCollection.where(mappings.liveStartedField, "==", true).count().get(),
              usersCollection.where(mappings.livePassedField, "==", true).count().get(),
              usersCollection
                .where(mappings.liveLocationField, "==", mappings.anambraLocationValue)
                .count()
                .get(),
              usersCollection
                .where(mappings.liveLocationField, "==", mappings.anambraLocationValue)
                .where(mappings.liveCompletedField, "==", true)
                .count()
                .get(),
              usersCollection
                .where(mappings.liveLocationField, "==", mappings.anambraLocationValue)
                .where(mappings.livePassedField, "==", true)
                .count()
                .get(),
              usersCollection
                .where(mappings.liveLocationField, "==", mappings.deltaLocationValue)
                .count()
                .get(),
              usersCollection
                .where(mappings.liveLocationField, "==", mappings.deltaLocationValue)
                .where(mappings.liveCompletedField, "==", true)
                .count()
                .get(),
              usersCollection
                .where(mappings.liveLocationField, "==", mappings.deltaLocationValue)
                .where(mappings.livePassedField, "==", true)
                .count()
                .get()
            ]),
            policy.queryTimeoutMs
          ),
        policy.retryAttempts,
        policy.retryDelayMs,
        isRetryableFirestoreError
      );

      const aggregate = normalizeLiveAggregateRow({
        registeredCount: registeredCountSnap.data().count,
        startedCount: startedCountSnap.data().count,
        completedCount: completedCountSnap.data().count,
        attemptedCount: attemptedCountSnap.data().count,
        passedCount: passedCountSnap.data().count,
        anambraRegisteredCount: anambraRegisteredCountSnap.data().count,
        anambraCompletedCount: anambraCompletedCountSnap.data().count,
        anambraPassedCount: anambraPassedCountSnap.data().count,
        deltaRegisteredCount: deltaRegisteredCountSnap.data().count,
        deltaCompletedCount: deltaCompletedCountSnap.data().count,
        deltaPassedCount: deltaPassedCountSnap.data().count
      });

      return toAnalyticsPageDataFromLiveAggregate(aggregate, {
        anambraLabel: mappings.anambraLocationValue,
        deltaLabel: mappings.deltaLocationValue
      });
    }

    const doc = await withRetry(
      () =>
        withTimeout(
          db.collection(mappings.analyticsCollection).doc(mappings.analyticsDocId).get(),
          policy.queryTimeoutMs
        ),
      policy.retryAttempts,
      policy.retryDelayMs,
      isRetryableFirestoreError
    );
    if (!doc.exists) return null;
    return doc.data() as AnalyticsPageData;
  } catch (error) {
    logger.error("admin.firestore.analytics_failed", error, {
      collection: mappings.analyticsCollection,
      docId: mappings.analyticsDocId,
      strategy
    });
    throw error;
  }
}

export async function fetchContentFromFirestore(): Promise<ContentPageData | null> {
  const mappings = getFirestoreMappings();
  const db = getFirestore();
  if (!db) return null;
  const policy = getDataAccessPolicy();

  try {
    const snapshot = await withRetry(
      () =>
        withTimeout(
          db.collection(mappings.contentCollection).limit(200).get(),
          policy.queryTimeoutMs
        ),
      policy.retryAttempts,
      policy.retryDelayMs,
      isRetryableFirestoreError
    );
    const lessons = snapshot.docs.map((doc) => doc.data()) as ContentPageData["lessons"];
    return { lessons };
  } catch (error) {
    logger.error("admin.firestore.content_failed", error, {
      collection: mappings.contentCollection
    });
    throw error;
  }
}

export async function fetchRewardsFromFirestore(): Promise<RewardsPageData | null> {
  const mappings = getFirestoreMappings();
  const db = getFirestore();
  if (!db) return null;
  const policy = getDataAccessPolicy();

  try {
    const snapshot = await withRetry(
      () =>
        withTimeout(
          db.collection(mappings.rewardsCollection).limit(200).get(),
          policy.queryTimeoutMs
        ),
      policy.retryAttempts,
      policy.retryDelayMs,
      isRetryableFirestoreError
    );
    const rewards = snapshot.docs.map((doc) => doc.data()) as RewardsPageData["rewards"];
    return { rewards };
  } catch (error) {
    logger.error("admin.firestore.rewards_failed", error, {
      collection: mappings.rewardsCollection
    });
    throw error;
  }
}

export async function fetchReportsFromFirestore(): Promise<ReportsPageData | null> {
  const mappings = getFirestoreMappings();
  const db = getFirestore();
  if (!db) return null;
  const policy = getDataAccessPolicy();

  try {
    const snapshot = await withRetry(
      () =>
        withTimeout(
          db.collection(mappings.reportsCollection).limit(200).get(),
          policy.queryTimeoutMs
        ),
      policy.retryAttempts,
      policy.retryDelayMs,
      isRetryableFirestoreError
    );
    const exportsData = snapshot.docs.map((doc) => doc.data()) as ReportsPageData["exports"];
    return { exports: exportsData };
  } catch (error) {
    logger.error("admin.firestore.reports_failed", error, {
      collection: mappings.reportsCollection
    });
    throw error;
  }
}
