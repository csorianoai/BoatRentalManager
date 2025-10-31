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
