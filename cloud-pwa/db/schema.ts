import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const funds = sqliteTable("funds", { id: text("id").primaryKey(), userId: text("user_id").notNull(), code: text("code").notNull(), body: text("body").notNull(), updatedAt: text("updated_at").notNull() });
export const reports = sqliteTable("reports", { id: text("id").primaryKey(), userId: text("user_id").notNull(), code: text("code").notNull(), navDate: text("nav_date").notNull(), body: text("body").notNull(), generatedAt: text("generated_at").notNull() });
export const navCache = sqliteTable("nav_cache", { code: text("code").primaryKey(), body: text("body").notNull(), fetchedAt: text("fetched_at").notNull() });
export const refreshRuns = sqliteTable("refresh_runs", { id: text("id").primaryKey(), body: text("body").notNull(), generatedAt: text("generated_at").notNull() });
