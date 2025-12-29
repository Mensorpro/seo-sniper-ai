import db from "../db.server";

/**
 * Add a failed job to the retry queue
 */
export async function addFailedJob(data: {
    shop: string;
    productId: string;
    productTitle: string;
    imageId: string;
    imageUrl: string;
    errorMessage: string;
    maxRetries?: number;
}) {
    const nextRetryAt = new Date(Date.now() + 60000); // Retry in 1 minute

    return await db.failedJob.create({
        data: {
            ...data,
            maxRetries: data.maxRetries || 3,
            nextRetryAt,
            retryCount: 0,
            status: "pending",
        },
    });
}

/**
 * Get pending failed jobs that are ready to retry
 */
export async function getPendingRetries(shop: string) {
    return await db.failedJob.findMany({
        where: {
            shop,
            status: "pending",
            nextRetryAt: {
                lte: new Date(),
            },
        },
        orderBy: { createdAt: "asc" },
    });
}

/**
 * Mark a failed job as retrying
 */
export async function markRetrying(jobId: string) {
    return await db.failedJob.update({
        where: { id: jobId },
        data: {
            status: "retrying",
            lastAttemptAt: new Date(),
        },
    });
}

/**
 * Increment retry count and schedule next retry
 */
export async function scheduleRetry(jobId: string, delayMs: number = 120000) {
    const job = await db.failedJob.findUnique({ where: { id: jobId } });

    if (!job) {
        throw new Error("Job not found");
    }

    const newRetryCount = job.retryCount + 1;
    const nextRetryAt = new Date(Date.now() + delayMs);

    if (newRetryCount >= job.maxRetries) {
        // Mark as permanently failed
        return await db.failedJob.update({
            where: { id: jobId },
            data: {
                retryCount: newRetryCount,
                status: "failed_permanent",
                lastAttemptAt: new Date(),
            },
        });
    }

    return await db.failedJob.update({
        where: { id: jobId },
        data: {
            retryCount: newRetryCount,
            nextRetryAt,
            status: "pending",
            lastAttemptAt: new Date(),
        },
    });
}

/**
 * Remove a successfully processed job from the queue
 */
export async function removeFailedJob(jobId: string) {
    return await db.failedJob.delete({
        where: { id: jobId },
    });
}

/**
 * Get all failed jobs for a shop
 */
export async function getAllFailedJobs(shop: string) {
    return await db.failedJob.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
    });
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(retryCount: number): number {
    const baseDelay = 2000; // 2 seconds
    const maxDelay = 300000; // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    return delay;
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: any): boolean {
    const errorMessage = error?.message || String(error);

    // Retryable errors
    const retryablePatterns = [
        /rate limit/i,
        /429/,
        /timeout/i,
        /ECONNRESET/,
        /ETIMEDOUT/,
        /network/i,
    ];

    return retryablePatterns.some((pattern) => pattern.test(errorMessage));
}
