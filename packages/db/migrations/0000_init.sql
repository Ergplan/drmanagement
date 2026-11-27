CREATE TYPE "public"."dr_class" AS ENUM('flexible', 'conditional', 'protected', 'critical', 'meter');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('proposed', 'approved', 'signed', 'armed', 'running', 'completed', 'aborted', 'lapsed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."quality" AS ENUM('good', 'estimated', 'stale', 'bad');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('facility_manager', 'medical_superintendent', 'duty_engineer', 'accounts', 'joulewise_ops', 'viewer');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"site_id" text,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "approval_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" text NOT NULL,
	"role" "role" NOT NULL,
	"user_id" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"dr_class" "dr_class" NOT NULL,
	"rated_flex_kw" double precision DEFAULT 0 NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"authority" text,
	"interlock" text,
	"profile" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"label" text NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"kvah" double precision NOT NULL,
	"kwh" double precision,
	"billed_kva" double precision NOT NULL,
	"months" smallint DEFAULT 1 NOT NULL,
	"pf" double precision,
	"total" double precision NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_line" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_line_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bill_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billed_demand_month" (
	"connection_id" text NOT NULL,
	"month" date NOT NULL,
	"kva" double precision NOT NULL,
	CONSTRAINT "billed_demand_month_connection_id_month_pk" PRIMARY KEY("connection_id","month")
);
--> statement-breakpoint
CREATE TABLE "block_15m" (
	"site_id" text NOT NULL,
	"block_start" timestamp with time zone NOT NULL,
	"block_no" smallint NOT NULL,
	"kwh" double precision NOT NULL,
	"kvah" double precision NOT NULL,
	"kvarh" double precision DEFAULT 0 NOT NULL,
	"avg_kva" double precision NOT NULL,
	"max_kva" double precision NOT NULL,
	"solar_kwh" double precision DEFAULT 0 NOT NULL,
	"asset_kwh" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"quality" "quality" DEFAULT 'good' NOT NULL,
	CONSTRAINT "block_15m_site_id_block_start_pk" PRIMARY KEY("site_id","block_start")
);
--> statement-breakpoint
CREATE TABLE "ceiling_action" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ceiling_action_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"stage" smallint NOT NULL,
	"kind" text NOT NULL,
	"asset_id" text,
	"projected_kva" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ceiling_state" (
	"site_id" text PRIMARY KEY NOT NULL,
	"armed" boolean DEFAULT true NOT NULL,
	"stage" smallint DEFAULT 0 NOT NULL,
	"projected_kva" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"action" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"intent_id" text,
	"sent_at" timestamp with time zone NOT NULL,
	"result" text NOT NULL,
	"detail" text,
	"supersedes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"utility" text NOT NULL,
	"account" text NOT NULL,
	"tariff_category" text NOT NULL,
	"voltage_kv" double precision NOT NULL,
	"sanctioned_kva" double precision NOT NULL,
	"billing_floor_kva" double precision NOT NULL,
	"main_meter" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contact_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" text NOT NULL,
	"role" "role" NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_1d" (
	"site_id" text NOT NULL,
	"day" date NOT NULL,
	"kwh" double precision NOT NULL,
	"kvah" double precision NOT NULL,
	"md_kva" double precision NOT NULL,
	"solar_kwh" double precision DEFAULT 0 NOT NULL,
	"cost_inr" double precision,
	"asset_kwh" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "day_1d_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"secret_hash" text,
	"last_seen" timestamp with time zone,
	"version" text,
	"health" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dr_event" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"program_id" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"target_kw" double precision NOT NULL,
	"nomination_kw" double precision,
	"status" "event_status" DEFAULT 'proposed' NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"forecast_peak_kva" double precision,
	"planned_peak_kva" double precision,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dr_event_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dr_event_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dr_intent" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"steps" jsonb NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"kind" text DEFAULT 'dr' NOT NULL,
	"acked_at" timestamp with time zone,
	"ack_result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dr_program" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"notice_min" integer NOT NULL,
	"baseline_method" text NOT NULL,
	"baseline_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payment_inr_per_kw" double precision,
	"penalty_inr_per_kw" double precision,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "equipment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"asset_id" text NOT NULL,
	"name" text NOT NULL,
	"rating" text
);
--> statement-breakpoint
CREATE TABLE "floor" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"level" smallint NOT NULL,
	"name" text NOT NULL,
	"uses" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast" (
	"site_id" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"block_start" timestamp with time zone NOT NULL,
	"p10" double precision NOT NULL,
	"p50" double precision NOT NULL,
	"p90" double precision NOT NULL,
	"drivers" jsonb,
	CONSTRAINT "forecast_site_id_run_at_block_start_pk" PRIMARY KEY("site_id","run_at","block_start")
);
--> statement-breakpoint
CREATE TABLE "interlock" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"limit_text" text NOT NULL,
	"point_id" text,
	"rule" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interlock_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "interlock_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"interlock_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"floor_id" text NOT NULL,
	"asset_id" text,
	"title" text NOT NULL,
	"dr_class" "dr_class" NOT NULL,
	"pos" jsonb NOT NULL,
	"look" double precision DEFAULT 0 NOT NULL,
	"driver_later" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "nomination" (
	"event_id" text PRIMARY KEY NOT NULL,
	"kw" double precision NOT NULL,
	"basis" text
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" text NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"value_inr" double precision,
	"value_inr_per_month" double precision,
	"status" text DEFAULT 'found' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point" (
	"id" text PRIMARY KEY NOT NULL,
	"node_id" text,
	"asset_id" text,
	"kind" text NOT NULL,
	"unit" text NOT NULL,
	"source_driver" text DEFAULT 'sim' NOT NULL,
	"device_ref" text,
	"required_freshness_s" integer DEFAULT 120 NOT NULL,
	"min" double precision,
	"max" double precision
);
--> statement-breakpoint
CREATE TABLE "reading_1m" (
	"point_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"source" text NOT NULL,
	"quality" "quality" DEFAULT 'good' NOT NULL,
	CONSTRAINT "reading_1m_point_id_ts_pk" PRIMARY KEY("point_id","ts")
) PARTITION BY RANGE ("ts");
--> statement-breakpoint
CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"kind" text NOT NULL,
	"period_from" date,
	"period_to" date,
	"blob_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement" (
	"event_id" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"baseline" jsonb NOT NULL,
	"actual" jsonb NOT NULL,
	"delivered_kw" double precision NOT NULL,
	"delivered_kwh" double precision NOT NULL,
	"performance_pct" double precision NOT NULL,
	"value_inr" double precision NOT NULL,
	"avoided_tco2" double precision NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"public_brand" text,
	"address" text,
	"beds" integer,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"category" text NOT NULL,
	"energy_rate_per_kvah" double precision NOT NULL,
	"demand_rate_per_kva_month" double precision NOT NULL,
	"duty_pct" double precision NOT NULL,
	"floor_pct" double precision NOT NULL,
	"excess_surcharge" double precision NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather" (
	"site_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"temp_c" double precision,
	"rh_pct" double precision,
	"ghi_wm2" double precision,
	"source" text NOT NULL,
	CONSTRAINT "weather_site_id_at_pk" PRIMARY KEY("site_id","at")
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_event_id_dr_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dr_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_line" ADD CONSTRAINT "bill_line_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billed_demand_month" ADD CONSTRAINT "billed_demand_month_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_15m" ADD CONSTRAINT "block_15m_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceiling_action" ADD CONSTRAINT "ceiling_action_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceiling_state" ADD CONSTRAINT "ceiling_state_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command" ADD CONSTRAINT "command_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command" ADD CONSTRAINT "command_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_1d" ADD CONSTRAINT "day_1d_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dr_event" ADD CONSTRAINT "dr_event_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dr_event" ADD CONSTRAINT "dr_event_program_id_dr_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."dr_program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dr_event_log" ADD CONSTRAINT "dr_event_log_event_id_dr_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dr_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dr_intent" ADD CONSTRAINT "dr_intent_event_id_dr_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dr_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dr_program" ADD CONSTRAINT "dr_program_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor" ADD CONSTRAINT "floor_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast" ADD CONSTRAINT "forecast_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interlock" ADD CONSTRAINT "interlock_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interlock_event" ADD CONSTRAINT "interlock_event_interlock_id_interlock_id_fk" FOREIGN KEY ("interlock_id") REFERENCES "public"."interlock"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_floor_id_floor_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_event_id_dr_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dr_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point" ADD CONSTRAINT "point_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point" ADD CONSTRAINT "point_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_event_id_dr_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dr_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather" ADD CONSTRAINT "weather_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_idx" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "command_site_sent_idx" ON "command" USING btree ("site_id","sent_at");--> statement-breakpoint
CREATE INDEX "point_node_idx" ON "point" USING btree ("node_id");