import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const boats = pgTable("boats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  capacity: integer("capacity").notNull(),
  pricePerDay: decimal("price_per_day", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("available"),
  imageUrl: text("image_url"),
  description: text("description"),
});

export const insertBoatSchema = createInsertSchema(boats).omit({
  id: true,
}).extend({
  capacity: z.coerce.number().min(1, "Capacity must be at least 1"),
  pricePerDay: z.coerce.number().positive("Price must be greater than 0").transform(val => val.toFixed(2)),
  status: z.enum(["available", "rented", "maintenance", "unavailable"]).default("available"),
});

export type InsertBoat = z.infer<typeof insertBoatSchema>;
export type Boat = typeof boats.$inferSelect;

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
}).extend({
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone number is required"),
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const rentals = pgTable("rentals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  boatId: varchar("boat_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("pending"),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
});

export const insertRentalSchema = createInsertSchema(rentals).omit({
  id: true,
}).extend({
  customerId: z.string().min(1, "Customer is required"),
  boatId: z.string().min(1, "Boat is required"),
  startDate: z.string().min(1, "Start date is required").refine((date) => {
    const d = new Date(date);
    return !isNaN(d.getTime());
  }, "Invalid start date"),
  endDate: z.string().min(1, "End date is required").refine((date) => {
    const d = new Date(date);
    return !isNaN(d.getTime());
  }, "Invalid end date"),
  status: z.enum(["pending", "confirmed", "active", "completed", "cancelled"]).default("pending"),
  totalPrice: z.coerce.number().positive("Total price must be greater than 0").transform(val => val.toFixed(2)),
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start <= end;
}, {
  message: "End date must be after or equal to start date",
  path: ["endDate"],
});

export type InsertRental = z.infer<typeof insertRentalSchema>;
export type Rental = typeof rentals.$inferSelect;
