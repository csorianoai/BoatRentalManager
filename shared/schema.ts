import { pgTable, text, serial, integer, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Bookings table
export const bookings = pgTable("bookings", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  boatType: text("boat_type").notNull(),
  bookingDate: text("booking_date").notNull(),
  startTime: text("start_time"),
  durationHours: integer("duration_hours"),
  totalAmount: integer("total_amount").notNull(),
  status: text("status").notNull(),
  assignedCaptainId: text("assigned_captain_id"),
  assignedCaptainName: text("assigned_captain_name"),
  assignedCaptainPhone: text("assigned_captain_phone"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
export const insertBookingSchema = createInsertSchema(bookings);

// Captains table
export const captains = pgTable("captains", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull(),
  specialties: json("specialties").$type<string[]>().notNull(),
  photo: text("photo")
});

export type Captain = typeof captains.$inferSelect;
export type InsertCaptain = typeof captains.$inferInsert;
export const insertCaptainSchema = createInsertSchema(captains);

// FASE 1: Chat conversations with AI assistant
export const chatConversations = pgTable("chat_conversations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  messages: json("messages").$type<Array<{role: string, content: string, timestamp: string}>>().notNull(),
  status: text("status").notNull(), // active, completed, booking_created
  bookingId: text("booking_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;
export const insertChatConversationSchema = createInsertSchema(chatConversations);

// FASE 2: Platform sync status
export const platformSyncStatus = pgTable("platform_sync_status", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: text("sync_status").notNull(), // success, error, in_progress
  syncErrors: json("sync_errors").$type<string[]>(),
  bookingsSynced: integer("bookings_synced").default(0),
  conflictsDetected: integer("conflicts_detected").default(0),
  nextSyncAt: timestamp("next_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type PlatformSyncStatus = typeof platformSyncStatus.$inferSelect;
export type InsertPlatformSyncStatus = typeof platformSyncStatus.$inferInsert;
export const insertPlatformSyncStatusSchema = createInsertSchema(platformSyncStatus);

// FASE 4: Commission rules and payments
export const commissionRules = pgTable("commission_rules", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  commissionPercentage: integer("commission_percentage").notNull(),
  fixedFee: integer("fixed_fee").default(0),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type CommissionRule = typeof commissionRules.$inferSelect;
export type InsertCommissionRule = typeof commissionRules.$inferInsert;
export const insertCommissionRuleSchema = createInsertSchema(commissionRules);

export const commissionPayments = pgTable("commission_payments", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  captainId: text("captain_id").notNull(),
  grossAmount: integer("gross_amount").notNull(),
  commissionAmount: integer("commission_amount").notNull(),
  netAmount: integer("net_amount").notNull(),
  paymentStatus: text("payment_status").notNull(), // pending, paid, failed
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type CommissionPayment = typeof commissionPayments.$inferSelect;
export type InsertCommissionPayment = typeof commissionPayments.$inferInsert;
export const insertCommissionPaymentSchema = createInsertSchema(commissionPayments);

// FASE 5: Captain availability and schedule optimization
export const captainAvailability = pgTable("captain_availability", {
  id: text("id").primaryKey(),
  captainId: text("captain_id").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isAvailable: integer("is_available").default(1),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type CaptainAvailability = typeof captainAvailability.$inferSelect;
export type InsertCaptainAvailability = typeof captainAvailability.$inferInsert;
export const insertCaptainAvailabilitySchema = createInsertSchema(captainAvailability);
