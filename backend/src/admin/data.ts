import type {
  AnalyticsPageData,
  ContentPageData,
  ReportsPageData,
  RewardsPageData,
  UsersPageData
} from "./contracts.js";
import { getProviderMode, isForcedEmptyDataMode, allowMockFallback } from "./config.js";
import {
  fallbackAnalyticsData,
  fallbackContentData,
  fallbackReportsData,
  fallbackRewardsData,
  fallbackUsersData
} from "./fixtures.js";
import {
  fetchAnalyticsFromFirestore,
  fetchContentFromFirestore,
  fetchReportsFromFirestore,
  fetchRewardsFromFirestore,
  fetchUsersFromFirestore
} from "./providers/firestore.js";
import {
  fetchAnalyticsFromPostgres,
  fetchContentFromPostgres,
  fetchReportsFromPostgres,
  fetchRewardsFromPostgres,
  fetchUsersFromPostgres
} from "./providers/postgres.js";
import { logger } from "../lib/logging.js";

function toEmptyShape<T>(fallback: T): T {
  if (typeof fallback !== "object" || fallback === null) {
    return fallback;
  }
  const entries = Object.entries(fallback).map(([key, value]) => {
    if (Array.isArray(value)) {
      return [key, []];
    }
    return [key, value];
  });
  return Object.fromEntries(entries) as T;
}

async function resolveData<T>(
  fallback: T,
  postgresProvider: () => Promise<T | null>,
  firestoreProvider: () => Promise<T | null>
): Promise<T> {
  const mode = getProviderMode();

  if (isForcedEmptyDataMode()) {
    logger.warn("admin.data.forced_empty", { mode });
    return toEmptyShape(fallback);
  }

  if (mode === "postgres") {
    try {
      const data = await postgresProvider();
      if (data) return data;
    } catch (error) {
      logger.error("admin.data.postgres_failed", error);
      throw error;
    }
    if (!allowMockFallback()) {
      throw new Error("PostgreSQL provider returned no data in production mode.");
    }
    logger.warn("admin.data.postgres_fallback_used");
    return fallback;
  }

  if (mode === "firestore") {
    try {
      const data = await firestoreProvider();
      if (data) return data;
    } catch (error) {
      logger.error("admin.data.firestore_failed", error);
      throw error;
    }
    if (!allowMockFallback()) {
      throw new Error("Firestore provider returned no data in production mode.");
    }
    logger.warn("admin.data.firestore_fallback_used");
    return fallback;
  }

  let postgresData: T | null = null;
  try {
    postgresData = await postgresProvider();
  } catch (error) {
    logger.warn("admin.data.hybrid_postgres_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  if (postgresData) {
    return postgresData;
  }

  let firestoreData: T | null = null;
  try {
    firestoreData = await firestoreProvider();
  } catch (error) {
    logger.warn("admin.data.hybrid_firestore_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  if (firestoreData) {
    return firestoreData;
  }

  if (!allowMockFallback()) {
    throw new Error("No provider data available in production mode.");
  }
  logger.warn("admin.data.hybrid_fallback_used");
  return fallback;
}

export async function getUsersData(): Promise<UsersPageData> {
  return resolveData(fallbackUsersData, fetchUsersFromPostgres, fetchUsersFromFirestore);
}

export async function getAnalyticsData(): Promise<AnalyticsPageData> {
  return resolveData(
    fallbackAnalyticsData,
    fetchAnalyticsFromPostgres,
    fetchAnalyticsFromFirestore
  );
}

export async function getContentData(): Promise<ContentPageData> {
  return resolveData(fallbackContentData, fetchContentFromPostgres, fetchContentFromFirestore);
}

export type RewardsDataFilters = {
  status?: "Issued" | "Pending" | "Failed";
  from?: Date;
  to?: Date;
  q?: string;
  cursor?: string;
  limit?: number;
};

export async function getRewardsData(
  filters: RewardsDataFilters = {}
): Promise<RewardsPageData> {
  return resolveData(
    fallbackRewardsData,
    () => fetchRewardsFromPostgres(filters),
    fetchRewardsFromFirestore
  );
}

export async function getReportsData(): Promise<ReportsPageData> {
  return resolveData(fallbackReportsData, fetchReportsFromPostgres, fetchReportsFromFirestore);
}
