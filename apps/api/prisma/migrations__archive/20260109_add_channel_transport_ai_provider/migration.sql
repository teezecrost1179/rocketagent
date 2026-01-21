-- CreateEnum
CREATE TYPE "TransportProvider" AS ENUM ('TWILIO', 'RETELL', 'OTHER');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('RETELL', 'OTHER');

-- AlterTable
ALTER TABLE "SubscriberChannel"
  ADD COLUMN "aiProvider" "AiProvider",
  ADD COLUMN "transportProvider" "TransportProvider";
