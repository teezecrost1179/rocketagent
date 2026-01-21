-- Enforce non-null now that we've backfilled
ALTER TABLE "SubscriberChannel"
  ALTER COLUMN "transportProvider" SET NOT NULL,
  ALTER COLUMN "aiProvider" SET NOT NULL;
