import db from "../db.server";

export type ScanStats = {
    totalScans: number;
    totalImagesProcessed: number;
    totalImagesFailed: number;
    successRate: number;
    averageProcessingTime: number;
    recentScans: any[];
};

/**
 * Create a new scan history record
 */
export async function createScanHistory(shop: string, forceAll: boolean = false) {
    return await db.scanHistory.create({
        data: {
            shop,
            forceAll,
            status: "running",
        },
    });
}

/**
 * Update scan history with final stats
 */
export async function completeScanHistory(
    scanId: string,
    stats: {
        totalProducts: number;
        totalImages: number;
        imagesProcessed: number;
        imagesSkipped: number;
        imagesFailed: number;
    }
) {
    return await db.scanHistory.update({
        where: { id: scanId },
        data: {
            ...stats,
            completedAt: new Date(),
            status: stats.imagesFailed > 0 ? "completed_with_errors" : "completed",
        },
    });
}

/**
 * Record individual image processing result
 */
export async function recordImageProcessing(data: {
    scanId: string;
    productId: string;
    productTitle: string;
    imageId: string;
    imageUrl: string;
    oldAltText: string | null;
    newAltText: string;
    status: "success" | "failed" | "skipped";
    errorMessage?: string;
}) {
    return await db.processedImage.create({
        data,
    });
}

/**
 * Get analytics overview
 */
export async function getAnalytics(shop: string): Promise<ScanStats> {
    const scans = await db.scanHistory.findMany({
        where: { shop },
        orderBy: { startedAt: "desc" },
        take: 100,
    });

    const totalScans = scans.length;
    const completedScans = scans.filter((s) => s.completedAt);

    const totalImagesProcessed = scans.reduce((sum, s) => sum + s.imagesProcessed, 0);
    const totalImagesFailed = scans.reduce((sum, s) => sum + s.imagesFailed, 0);

    const successRate = totalImagesProcessed + totalImagesFailed > 0
        ? (totalImagesProcessed / (totalImagesProcessed + totalImagesFailed)) * 100
        : 0;

    // Calculate average processing time for completed scans
    const processingTimes = completedScans
        .filter((s) => s.completedAt && s.startedAt)
        .map((s) => s.completedAt!.getTime() - s.startedAt.getTime());

    const averageProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0;

    // Get recent scans with details
    const recentScans = await db.scanHistory.findMany({
        where: { shop },
        orderBy: { startedAt: "desc" },
        take: 10,
        include: {
            _count: {
                select: { processedImages: true },
            },
        },
    });

    return {
        totalScans,
        totalImagesProcessed,
        totalImagesFailed,
        successRate,
        averageProcessingTime,
        recentScans,
    };
}

/**
 * Get recent activity feed
 */
export async function getRecentActivity(shop: string, limit: number = 5) {
    return await db.scanHistory.findMany({
        where: { shop },
        orderBy: { startedAt: "desc" },
        take: limit,
        include: {
            processedImages: {
                take: 5,
                orderBy: { processedAt: "desc" },
            },
        },
    });
}

/**
 * Get detailed scan results
 */
export async function getScanDetails(scanId: string) {
    return await db.scanHistory.findUnique({
        where: { id: scanId },
        include: {
            processedImages: {
                orderBy: { processedAt: "desc" },
            },
        },
    });
}

/**
 * Get analytics for dashboard charts (last 30 days)
 */
export async function getChartData(shop: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const scans = await db.scanHistory.findMany({
        where: {
            shop,
            startedAt: {
                gte: thirtyDaysAgo,
            },
        },
        orderBy: { startedAt: "asc" },
    });

    // Group by day
    const dailyStats = scans.reduce((acc: any, scan) => {
        const date = scan.startedAt.toISOString().split("T")[0];
        if (!acc[date]) {
            acc[date] = {
                date,
                scans: 0,
                imagesProcessed: 0,
                imagesFailed: 0,
            };
        }
        acc[date].scans++;
        acc[date].imagesProcessed += scan.imagesProcessed;
        acc[date].imagesFailed += scan.imagesFailed;
        return acc;
    }, {});

    return Object.values(dailyStats);
}
