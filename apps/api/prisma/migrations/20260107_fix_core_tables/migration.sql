-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('VOICE', 'CHAT', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('RETELL', 'TWILIO', 'OTHER');

-- CreateEnum
CREATE TYPE "InteractionDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'AGENT', 'USER', 'TOOL');

-- AlterTable
ALTER TABLE "Subscriber" ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "billingStatus" TEXT,
ADD COLUMN     "plan" TEXT,
ADD COLUMN     "primaryEmail" TEXT;

-- DropTable
DROP TABLE "Client";

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberChannel" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" "ProviderType" NOT NULL DEFAULT 'OTHER',
    "providerAgentId" TEXT,
    "providerNumberE164" TEXT,
    "providerInboxId" TEXT,
    "defaultAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "direction" "InteractionDirection" NOT NULL,
    "status" "InteractionStatus" NOT NULL DEFAULT 'STARTED',
    "provider" "ProviderType" NOT NULL DEFAULT 'OTHER',
    "providerCallId" TEXT,
    "providerConversationId" TEXT,
    "fromNumberE164" TEXT,
    "toNumberE164" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "agentId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionMessage" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRollup" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "voiceCallsCount" INTEGER NOT NULL DEFAULT 0,
    "voiceMinutes" INTEGER NOT NULL DEFAULT 0,
    "chatConversationsCount" INTEGER NOT NULL DEFAULT 0,
    "chatMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "smsCount" INTEGER NOT NULL DEFAULT 0,
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_name_key" ON "Agent"("name");

-- CreateIndex
CREATE INDEX "SubscriberChannel_channel_enabled_idx" ON "SubscriberChannel"("channel", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriberChannel_subscriberId_channel_key" ON "SubscriberChannel"("subscriberId", "channel");

-- CreateIndex
CREATE INDEX "Interaction_subscriberId_startedAt_idx" ON "Interaction"("subscriberId", "startedAt");

-- CreateIndex
CREATE INDEX "Interaction_provider_providerCallId_idx" ON "Interaction"("provider", "providerCallId");

-- CreateIndex
CREATE INDEX "InteractionMessage_interactionId_createdAt_idx" ON "InteractionMessage"("interactionId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRollup_periodYear_periodMonth_idx" ON "UsageRollup"("periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRollup_subscriberId_periodYear_periodMonth_key" ON "UsageRollup"("subscriberId", "periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "SubscriberChannel" ADD CONSTRAINT "SubscriberChannel_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberChannel" ADD CONSTRAINT "SubscriberChannel_defaultAgentId_fkey" FOREIGN KEY ("defaultAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionMessage" ADD CONSTRAINT "InteractionMessage_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRollup" ADD CONSTRAINT "UsageRollup_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

