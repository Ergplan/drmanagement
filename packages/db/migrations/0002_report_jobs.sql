ALTER TABLE "report" ADD COLUMN "params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "pdf" "bytea";--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "ready_at" timestamp with time zone;