-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanHistory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "totalImages" INTEGER NOT NULL DEFAULT 0,
    "imagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "imagesSkipped" INTEGER NOT NULL DEFAULT 0,
    "imagesFailed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "forceAll" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedImage" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "oldAltText" TEXT,
    "newAltText" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "ProcessedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "altTextStyle" TEXT NOT NULL DEFAULT 'professional',
    "altTextLength" TEXT NOT NULL DEFAULT 'medium',
    "customPrompt" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 3,
    "autoRetry" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailedJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "FailedJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessedImage_scanId_idx" ON "ProcessedImage"("scanId");

-- CreateIndex
CREATE INDEX "ProcessedImage_productId_idx" ON "ProcessedImage"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");

-- CreateIndex
CREATE INDEX "FailedJob_shop_idx" ON "FailedJob"("shop");

-- CreateIndex
CREATE INDEX "FailedJob_status_idx" ON "FailedJob"("status");

-- CreateIndex
CREATE INDEX "FailedJob_nextRetryAt_idx" ON "FailedJob"("nextRetryAt");

-- AddForeignKey
ALTER TABLE "ProcessedImage" ADD CONSTRAINT "ProcessedImage_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ScanHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
