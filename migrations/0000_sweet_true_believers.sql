CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"boat_type" text NOT NULL,
	"booking_date" text NOT NULL,
	"start_time" text,
	"duration_hours" integer,
	"total_amount" integer NOT NULL,
	"status" text NOT NULL,
	"assigned_captain_id" text,
	"assigned_captain_name" text,
	"assigned_captain_phone" text,
	"notes" text,
	"internal_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captain_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"captain_id" text NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_available" integer DEFAULT 1,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captains" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"specialties" json NOT NULL,
	"photo" text
);
--> statement-breakpoint
CREATE TABLE "chat_ai_context" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"detected_language" text,
	"detected_intent" text,
	"intent_confidence" integer,
	"customer_preferences" json,
	"recommended_boats" json,
	"upsell_opportunities" json,
	"escalated_to_human" integer DEFAULT 0,
	"escalation_reason" text,
	"last_interaction_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_ai_context_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"messages" json NOT NULL,
	"status" text NOT NULL,
	"booking_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"captain_id" text NOT NULL,
	"gross_amount" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"payment_status" text NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"commission_percentage" integer NOT NULL,
	"fixed_fee" integer DEFAULT 0,
	"is_active" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_sync_status" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"last_sync_at" timestamp,
	"sync_status" text NOT NULL,
	"sync_errors" json,
	"bookings_synced" integer DEFAULT 0,
	"conflicts_detected" integer DEFAULT 0,
	"next_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"captain_id" text NOT NULL,
	"check_in_time" timestamp,
	"check_in_lat" text,
	"check_in_lon" text,
	"check_out_time" timestamp,
	"check_out_lat" text,
	"check_out_lon" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"captain_id" text NOT NULL,
	"trip_log_id" text NOT NULL,
	"weather_conditions" text,
	"sea_conditions" text,
	"fuel_used" integer,
	"passengers_actual" integer,
	"issues_reported" text,
	"customer_satisfaction" integer,
	"photos" json,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");