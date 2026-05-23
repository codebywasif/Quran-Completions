-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('COLLECTING', 'ALLOCATING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "VoteSource" AS ENUM ('POLL', 'MANUAL');

-- CreateEnum
CREATE TYPE "CompletionSource" AS ENUM ('POLL', 'REPLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PollKind" AS ENUM ('CAPACITY', 'COMPLETION');

-- CreateEnum
CREATE TYPE "OutboxType" AS ENUM ('CAPACITY_POLL', 'ALLOCATION', 'COMPLETION_POLL', 'REMINDER_MON', 'REMINDER_WED', 'REMINDER_THU', 'SUMMARY');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PENDING_APPROVAL', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "whatsappId" TEXT,
    "lidId" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "WeekStatus" NOT NULL DEFAULT 'COLLECTING',
    "quranCount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacityVote" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "juzCount" INTEGER NOT NULL,
    "rawLabel" TEXT,
    "source" "VoteSource" NOT NULL DEFAULT 'POLL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapacityVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JuzRequest" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "requestedJuz" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JuzRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "quranNumber" INTEGER NOT NULL,
    "juzNumber" INTEGER NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionVote" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CompletionSource" NOT NULL DEFAULT 'POLL',

    CONSTRAINT "CompletionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaPoll" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "kind" "PollKind" NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "optionMap" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteEvent" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "voterWid" TEXT NOT NULL,
    "selectedOptions" JSONB NOT NULL,
    "interactedAt" TIMESTAMP(3) NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "type" "OutboxType" NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "waMessageId" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "groupChatId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "timesTable" TEXT NOT NULL DEFAULT '',
    "templates" JSONB NOT NULL DEFAULT '{}',
    "schedule" JSONB NOT NULL DEFAULT '{}',
    "fivePlusValue" INTEGER NOT NULL DEFAULT 5,
    "countriesOverride" INTEGER,
    "completionKeywords" TEXT[] DEFAULT ARRAY['done', 'completed', 'complete']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_whatsappId_key" ON "Member"("whatsappId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_lidId_key" ON "Member"("lidId");

-- CreateIndex
CREATE INDEX "Member_active_idx" ON "Member"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Week_weekNumber_key" ON "Week"("weekNumber");

-- CreateIndex
CREATE INDEX "Week_status_idx" ON "Week"("status");

-- CreateIndex
CREATE INDEX "CapacityVote_weekId_idx" ON "CapacityVote"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "CapacityVote_weekId_memberId_key" ON "CapacityVote"("weekId", "memberId");

-- CreateIndex
CREATE INDEX "JuzRequest_weekId_idx" ON "JuzRequest"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "JuzRequest_weekId_memberId_key" ON "JuzRequest"("weekId", "memberId");

-- CreateIndex
CREATE INDEX "Allocation_weekId_idx" ON "Allocation"("weekId");

-- CreateIndex
CREATE INDEX "Allocation_weekId_memberId_idx" ON "Allocation"("weekId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_weekId_quranNumber_juzNumber_key" ON "Allocation"("weekId", "quranNumber", "juzNumber");

-- CreateIndex
CREATE INDEX "CompletionVote_weekId_idx" ON "CompletionVote"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "CompletionVote_weekId_memberId_key" ON "CompletionVote"("weekId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "WaPoll_waMessageId_key" ON "WaPoll"("waMessageId");

-- CreateIndex
CREATE INDEX "WaPoll_weekId_idx" ON "WaPoll"("weekId");

-- CreateIndex
CREATE INDEX "VoteEvent_pollId_idx" ON "VoteEvent"("pollId");

-- CreateIndex
CREATE INDEX "VoteEvent_voterWid_idx" ON "VoteEvent"("voterWid");

-- CreateIndex
CREATE INDEX "OutboxMessage_weekId_idx" ON "OutboxMessage"("weekId");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_idx" ON "OutboxMessage"("status");

-- CreateIndex
CREATE INDEX "OutboxMessage_scheduledFor_idx" ON "OutboxMessage"("scheduledFor");

-- AddForeignKey
ALTER TABLE "CapacityVote" ADD CONSTRAINT "CapacityVote_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityVote" ADD CONSTRAINT "CapacityVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuzRequest" ADD CONSTRAINT "JuzRequest_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JuzRequest" ADD CONSTRAINT "JuzRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionVote" ADD CONSTRAINT "CompletionVote_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionVote" ADD CONSTRAINT "CompletionVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPoll" ADD CONSTRAINT "WaPoll_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteEvent" ADD CONSTRAINT "VoteEvent_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "WaPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
