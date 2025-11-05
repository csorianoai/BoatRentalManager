import { pgTable, text, serial, integer, timestamp, json, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

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

// FASE 6: AI-powered booking assistant context
export const chatAiContext = pgTable("chat_ai_context", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  detectedLanguage: text("detected_language"), // 'es' or 'en'
  detectedIntent: text("detected_intent"), // 'booking', 'inquiry', 'support', 'availability_check', 'recommendation'
  intentConfidence: integer("intent_confidence"), // 0-100
  customerPreferences: json("customer_preferences").$type<{
    boatType?: string,
    duration?: string,
    groupSize?: number,
    budget?: string,
    specialRequests?: string[]
  }>(),
  recommendedBoats: json("recommended_boats").$type<string[]>(),
  upsellOpportunities: json("upsell_opportunities").$type<string[]>(),
  escalatedToHuman: integer("escalated_to_human").default(0), // 0 or 1
  escalationReason: text("escalation_reason"),
  lastInteractionAt: timestamp("last_interaction_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  lastInteractionIdx: index("idx_chat_ai_context_last_interaction").on(table.lastInteractionAt),
  intentIdx: index("idx_chat_ai_context_intent").on(table.detectedIntent)
}));

export type ChatAiContext = typeof chatAiContext.$inferSelect;
export type InsertChatAiContext = typeof chatAiContext.$inferInsert;
export const insertChatAiContextSchema = createInsertSchema(chatAiContext);

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

// FASE 3: Trip logs (check-ins/check-outs)
export const tripLogs = pgTable("trip_logs", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  captainId: text("captain_id").notNull(),
  checkInTime: timestamp("check_in_time"),
  checkInLat: text("check_in_lat"),
  checkInLon: text("check_in_lon"),
  checkOutTime: timestamp("check_out_time"),
  checkOutLat: text("check_out_lat"),
  checkOutLon: text("check_out_lon"),
  status: text("status").notNull(), // pending, in_progress, completed
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type TripLog = typeof tripLogs.$inferSelect;
export type InsertTripLog = typeof tripLogs.$inferInsert;
export const insertTripLogSchema = createInsertSchema(tripLogs);

// FASE 3: Trip reports (informes de viaje)
export const tripReports = pgTable("trip_reports", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  captainId: text("captain_id").notNull(),
  tripLogId: text("trip_log_id").notNull(),
  weatherConditions: text("weather_conditions"),
  seaConditions: text("sea_conditions"),
  fuelUsed: integer("fuel_used"), // in liters
  passengersActual: integer("passengers_actual"),
  issuesReported: text("issues_reported"),
  customerSatisfaction: integer("customer_satisfaction"), // 1-5 rating
  photos: json("photos").$type<string[]>(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type TripReport = typeof tripReports.$inferSelect;
export type InsertTripReport = typeof tripReports.$inferInsert;
export const insertTripReportSchema = createInsertSchema(tripReports);

// FASE 7: Boats inventory (assets disponibles para rentar)
export const boats = pgTable("boats", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  boatType: text("boat_type").notNull(), // fishing, touring, VIP, standard
  status: text("status").notNull(), // active, maintenance, retired
  description: text("description"), // short description
  fullDescription: text("full_description"), // detailed description for platforms
  features: json("features").$type<string[]>(),
  amenities: json("amenities").$type<string[]>(), // GPS, Bluetooth, Cooler, Snorkel gear, etc
  photos: json("photos").$type<string[]>(), // array of photo URLs
  platformIds: jsonb("platform_ids").$type<{
    boatsetter?: string,
    getmyboat?: string,
    airbnb?: string,
    viator?: string,
    expedia?: string,
    tripadvisor?: string,
    groupon?: string,
    bookingcom?: string,
    fareharbor?: string,
    bokun?: string,
    rezdy?: string,
    peek?: string,
    xola?: string
  }>(), // IDs en cada plataforma externa
  hourlyRateBase: integer("hourly_rate_base"), // precio base por hora en cents
  dailyRateBase: integer("daily_rate_base"), // precio base por día en cents
  location: text("location"), // marina/puerto donde está el barco
  year: integer("year"), // año del barco
  make: text("make"), // fabricante
  model: text("model"), // modelo
  length: integer("length"), // eslora en pies
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export type Boat = typeof boats.$inferSelect;
export type InsertBoat = typeof boats.$inferInsert;
export const insertBoatSchema = createInsertSchema(boats).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

// FASE 7: Platform pricing policies (precio base por plataforma)
export const platformPricingPolicies = pgTable("platform_pricing_policies", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  boatId: text("boat_id").notNull(),
  basePriceHalfDay: integer("base_price_half_day").notNull(), // 4 hours
  basePriceFullDay: integer("base_price_full_day").notNull(), // 8 hours
  currency: text("currency").default("USD"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export type PlatformPricingPolicy = typeof platformPricingPolicies.$inferSelect;
export type InsertPlatformPricingPolicy = typeof platformPricingPolicies.$inferInsert;
export const insertPlatformPricingPolicySchema = createInsertSchema(platformPricingPolicies);

// FASE 7: Pricing adjustments (descuentos/aumentos centralizados)
export const pricingAdjustments = pgTable("pricing_adjustments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  adjustmentType: text("adjustment_type").notNull(), // percentage, fixed_amount
  adjustmentValue: integer("adjustment_value").notNull(), // can be negative for discounts
  scope: text("scope").notNull(), // all_platforms, specific_platforms, specific_boats
  targetPlatforms: json("target_platforms").$type<string[]>(), // ['Airbnb', 'GetMyBoat'] or null for all
  targetBoats: json("target_boats").$type<string[]>(), // ['boat_1', 'boat_2'] or null for all
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  priority: integer("priority").default(0), // for stacking order, higher = applied last
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export type PricingAdjustment = typeof pricingAdjustments.$inferSelect;
export type InsertPricingAdjustment = typeof pricingAdjustments.$inferInsert;
export const insertPricingAdjustmentSchema = createInsertSchema(pricingAdjustments);

// FASE 7: Availability blocks (prevención de double-booking)
export const availabilityBlocks = pgTable("availability_blocks", {
  id: text("id").primaryKey(),
  boatId: text("boat_id").notNull(),
  blockDate: text("block_date").notNull(), // YYYY-MM-DD
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(), // HH:MM
  blockType: text("block_type").notNull(), // booking, maintenance, manual
  bookingId: text("booking_id"), // reference to booking if blockType = 'booking'
  reason: text("reason"),
  status: text("status").notNull(), // blocked, released
  createdAt: timestamp("created_at").defaultNow().notNull(),
  releasedAt: timestamp("released_at")
}, (table) => ({
  lookupIdx: index("idx_availability_blocks_lookup").on(table.boatId, table.blockDate, table.status)
}));

export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type InsertAvailabilityBlock = typeof availabilityBlocks.$inferInsert;
export const insertAvailabilityBlockSchema = createInsertSchema(availabilityBlocks);

// FASE 11: Boat availability calendar (calendario maestro de disponibilidad)
export const boatAvailability = pgTable("boat_availability", {
  id: text("id").primaryKey(),
  boatId: text("boat_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  isAvailable: integer("is_available").default(1), // 1 = available, 0 = blocked
  blockReason: text("block_reason"), // booking, maintenance, weather, other
  bookingId: text("booking_id"), // reference to booking if blocked by booking
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  dateIdx: index("idx_boat_availability_date").on(table.boatId, table.date)
}));

export type BoatAvailability = typeof boatAvailability.$inferSelect;
export type InsertBoatAvailability = typeof boatAvailability.$inferInsert;
export const insertBoatAvailabilitySchema = createInsertSchema(boatAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// FASE 7: Sync jobs (cola de sincronización bidireccional)
export const syncJobs = pgTable("sync_jobs", {
  id: text("id").primaryKey(),
  jobType: text("job_type").notNull(), // block_date, unblock_date, update_price
  targetPlatform: text("target_platform").notNull(),
  payload: json("payload").$type<{
    boatId?: string,
    date?: string,
    startTime?: string,
    endTime?: string,
    bookingId?: string,
    price?: number,
    [key: string]: any
  }>().notNull(),
  status: text("status").notNull(), // pending, processing, completed, failed
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastAttemptAt: timestamp("last_attempt_at"),
  errorMessage: text("error_message"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  queueIdx: index("idx_sync_jobs_queue").on(table.status, table.createdAt)
}));

export type SyncJob = typeof syncJobs.$inferSelect;
export type InsertSyncJob = typeof syncJobs.$inferInsert;
export const insertSyncJobSchema = createInsertSchema(syncJobs);

// AUTHENTICATION: Session storage table
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// AUTHENTICATION: User storage table
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
