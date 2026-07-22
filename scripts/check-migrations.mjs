import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationsDirectory = resolve(root, "supabase", "migrations");
const requiredMigrations = [
  "001_initial_schema.sql",
  "002_multi_tenant.sql",
  "003_saas_foundation.sql",
  "004_operations.sql",
  "005_billing.sql",
  "006_security_hardening.sql",
  "007_conversation_language.sql",
  "008_idempotency_and_atomic_usage.sql",
  "009_request_idempotency_and_audit.sql",
  "010_idempotent_usage_reservations.sql",
  "011_structured_memory_and_learning.sql",
  "012_flight_arrival_details.sql",
  "013_pricing_snapshots.sql",
  "014_jpairport_pricing_configuration.sql",
  "015_hotel_reference_and_charter_pricing.sql",
  "016_workflow_quote_state_defaults.sql",
];

const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql"));
const missing = requiredMigrations.filter((file) => !files.includes(file));
const numberedFiles = files
  .map((file) => ({ file, number: Number.parseInt(file.split("_")[0], 10) }))
  .filter(({ number }) => Number.isFinite(number))
  .sort((a, b) => a.number - b.number);
const numbered = numberedFiles.map(({ number }) => number);
const maxMigration = Math.max(...numbered, 0);
const missingNumbers = Array.from({ length: maxMigration }, (_, index) => index + 1)
  .filter((number) => !numbered.includes(number));

if (missing.length > 0) {
  throw new Error(`Missing migrations: ${missing.join(", ")}`);
}
if (missingNumbers.length > 0) {
  throw new Error(`Migration sequence is not contiguous: ${numbered.join(", ")}`);
}

const migration007 = await readFile(resolve(migrationsDirectory, requiredMigrations[6]), "utf8");
const migration008 = await readFile(resolve(migrationsDirectory, requiredMigrations[7]), "utf8");
const migration009 = await readFile(resolve(migrationsDirectory, requiredMigrations[8]), "utf8");
const migration010 = await readFile(resolve(migrationsDirectory, requiredMigrations[9]), "utf8");
const migration011 = await readFile(resolve(migrationsDirectory, requiredMigrations[10]), "utf8");
const migration012 = await readFile(resolve(migrationsDirectory, requiredMigrations[11]), "utf8");
const migration013 = await readFile(resolve(migrationsDirectory, requiredMigrations[12]), "utf8");
const migration014 = await readFile(resolve(migrationsDirectory, requiredMigrations[13]), "utf8");
const migration015 = await readFile(resolve(migrationsDirectory, requiredMigrations[14]), "utf8");
const migration016 = await readFile(resolve(migrationsDirectory, requiredMigrations[15]), "utf8");
if (!migration007.includes("customer_language")) {
  throw new Error("Migration 007 does not contain customer_language support.");
}
if (!migration008.includes("consume_company_usage") || !migration008.includes("dedupe_key")) {
  throw new Error("Migration 008 is missing idempotency or atomic usage support.");
}
if (!migration009.includes("request_idempotency") || !migration009.includes("audit_events")) {
  throw new Error("Migration 009 is missing request idempotency or audit support.");
}
if (!migration010.includes("consume_company_usage_idempotent") || !migration010.includes("usage_reservations")) {
  throw new Error("Migration 010 is missing idempotent usage reservations.");
}
if (!migration011.includes("conversation_memory") || !migration011.includes("learning_cases") || !migration011.includes("booking_events")) {
  throw new Error("Migration 011 is missing structured memory, learning cases, or booking events.");
}
if (!migration012.includes("flight_arrival")) {
  throw new Error("Migration 012 is missing flight arrival storage.");
}
if (!migration013.includes("pricing_snapshot")) {
  throw new Error("Migration 013 is missing pricing snapshot storage.");
}
if (!migration014.includes("company_jpairport") || !migration014.includes("workflowai-pricing-v2")) {
  throw new Error("Migration 014 is missing the live JP VIP pricing configuration.");
}
if (!migration015.includes("hotel_reference_catalog") || !migration015.includes("standardHours") || !migration015.includes("fujiHiaceBaseYen")) {
  throw new Error("Migration 015 is missing hotel reference or charter pricing support.");
}
if (!migration016.includes("ALTER COLUMN currency SET DEFAULT 'JPY'")) {
  throw new Error("Migration 016 is missing the JPY quote currency default.");
}

if (process.env.CHECK_LIVE_DB === "true") {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("CHECK_LIVE_DB=true requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const liveChecks = [
    ["conversations.customer_language", "conversations?select=customer_language&limit=1"],
    ["conversation_messages.idempotency_key", "conversation_messages?select=idempotency_key&limit=1"],
    ["boss_inbox.dedupe_key", "boss_inbox?select=dedupe_key&limit=1"],
    ["request_idempotency", "request_idempotency?select=idempotency_key&limit=1"],
    ["audit_events", "audit_events?select=action&limit=1"],
    ["usage_reservations", "usage_reservations?select=idempotency_key&limit=1"],
    ["conversation_memory", "conversation_memory?select=fact_key&limit=1"],
    ["booking_events", "booking_events?select=event_type&limit=1"],
    ["learning_cases", "learning_cases?select=outcome&limit=1"],
    ["bookings.flight_arrival", "bookings?select=flight_arrival&limit=1"],
    ["boss_inbox.pricing_snapshot", "boss_inbox?select=pricing_snapshot&limit=1"],
    ["bookings.pricing_snapshot", "bookings?select=pricing_snapshot&limit=1"],
    ["bookings.currency", "bookings?select=currency&limit=1"],
    ["hotel_reference_catalog", "hotel_reference_catalog?select=hotel_name&limit=1"],
  ];
  for (const [label, path] of liveChecks) {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Live migration check failed for ${label}: ${response.status} ${await response.text()}`);
    }
  }
  console.log("Live database exposes migration 007 and 008 columns.");
}

console.log(`Verified ${requiredMigrations.length} ordered database migrations.`);
