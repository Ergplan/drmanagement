CREATE TABLE "assistant_call" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assistant_call_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"ms" integer,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grid_signal" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grid_signal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"start" timestamp with time zone,
	"end" timestamp with time zone,
	"target_kw" double precision,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_id" text,
	"status" text NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "dr_event" ADD COLUMN "source" text DEFAULT 'ergos' NOT NULL;--> statement-breakpoint
ALTER TABLE "dr_event" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "grid_signal" ADD CONSTRAINT "grid_signal_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grid_signal_source_ext_idx" ON "grid_signal" USING btree ("source","external_id");