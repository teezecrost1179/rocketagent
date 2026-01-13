-- Add public-facing contact fields to Subscriber (nullable = safe)
ALTER TABLE "Subscriber"
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "publicPhoneE164" TEXT;
