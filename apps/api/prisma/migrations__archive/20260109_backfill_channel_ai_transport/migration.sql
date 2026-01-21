-- Backfill transportProvider from existing provider when missing
UPDATE "SubscriberChannel"
SET "transportProvider" =
  CASE "provider"
    WHEN 'TWILIO' THEN 'TWILIO'::"TransportProvider"
    WHEN 'RETELL' THEN 'RETELL'::"TransportProvider"
    ELSE 'OTHER'::"TransportProvider"
  END
WHERE "transportProvider" IS NULL;

-- Default aiProvider to RETELL when missing
UPDATE "SubscriberChannel"
SET "aiProvider" = 'RETELL'::"AiProvider"
WHERE "aiProvider" IS NULL;
