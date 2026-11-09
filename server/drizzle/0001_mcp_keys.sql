CREATE TYPE "public"."mcp_access" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "mcp_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"prefix" varchar(16) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"access" "mcp_access" DEFAULT 'read' NOT NULL,
	"connection_ids" uuid[],
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_keys_key_hash_unique" UNIQUE("key_hash")
);
