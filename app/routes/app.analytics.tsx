import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getAnalytics, getChartData } from "../services/analytics.server";
import {
    Page,
    Layout,
    LegacyCard,
    Grid,
    BlockStack,
    Text,
    DataTable,
    Box,
    Banner,
    List,
    Badge,
    InlineStack
} from "@shopify/polaris";
import { AlertCircleIcon, CheckIcon, ClockIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    const analytics = await getAnalytics(session.shop);
    const chartData = await getChartData(session.shop);

    return { analytics, chartData, shop: session.shop };
};

export default function Analytics() {
    const { analytics, chartData } = useLoaderData<typeof loader>();
    const navigate = useNavigate();

    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    // Prepare table data for recent activity
    const activityRows = analytics.recentScans.slice(0, 10).map((scan: any) => [
        new Date(scan.startedAt).toLocaleString(),
        <Badge tone={
            (scan.status === 'completed' ? 'success' :
                scan.status.includes('error') ? 'warning' : 'info') as any
        }>
            {scan.status.replace("_", " ").toUpperCase()}
        </Badge>,
        scan.totalProducts.toString(),
        scan.imagesProcessed.toString(),
        scan.imagesFailed > 0 ? <Text as="span" tone="critical">{scan.imagesFailed}</Text> : "0",
        scan.completedAt ? formatDuration(new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime()) : "-"
    ]);

    // Prepare table data for 30-day trend
    const trendRows = chartData.slice(-14).reverse().map((day: any) => [
        day.date,
        day.scans.toString(),
        day.imagesProcessed.toString(),
        day.imagesFailed.toString()
    ]);

    return (
        <Page
            title="Analytics Dashboard"
            backAction={{ content: 'Dashboard', url: '/app' }}
            subtitle="Deep dive into your AI optimization performance"
        >
            <BlockStack gap="600">
                {/* Key Metrics Grid */}
                <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                        <LegacyCard sectioned>
                            <Box minHeight="100px">
                                <BlockStack gap="200">
                                    <Text as="h2" variant="headingSm" tone="subdued">Total Scans</Text>
                                    <Text as="p" variant="heading3xl">{analytics.totalScans}</Text>
                                </BlockStack>
                            </Box>
                        </LegacyCard>
                    </Grid.Cell>

                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                        <LegacyCard sectioned>
                            <Box minHeight="100px">
                                <BlockStack gap="200">
                                    <Text as="h2" variant="headingSm" tone="subdued">Total Images Processed</Text>
                                    <Text as="p" variant="heading3xl" tone="success">
                                        {analytics.totalImagesProcessed}
                                    </Text>
                                </BlockStack>
                            </Box>
                        </LegacyCard>
                    </Grid.Cell>

                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                        <LegacyCard sectioned>
                            <Box minHeight="100px">
                                <BlockStack gap="200">
                                    <Text as="h2" variant="headingSm" tone="subdued">Success Rate</Text>
                                    <Text
                                        as="p"
                                        variant="heading3xl"
                                        tone={(analytics.successRate >= 90 ? "success" : analytics.successRate >= 70 ? "warning" : "critical") as any}
                                    >
                                        {analytics.successRate.toFixed(1)}%
                                    </Text>
                                </BlockStack>
                            </Box>
                        </LegacyCard>
                    </Grid.Cell>

                    <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                        <LegacyCard sectioned>
                            <Box minHeight="100px">
                                <BlockStack gap="200">
                                    <Text as="h2" variant="headingSm" tone="subdued">Avg Processing Time</Text>
                                    <InlineStack gap="200" align="start" blockAlign="center">
                                        <ClockIcon className="w-5 h-5 text-gray-500" />
                                        <Text as="p" variant="heading3xl">
                                            {formatDuration(analytics.averageProcessingTime)}
                                        </Text>
                                    </InlineStack>
                                </BlockStack>
                            </Box>
                        </LegacyCard>
                    </Grid.Cell>
                </Grid>

                <Layout>
                    <Layout.Section>
                        {/* Performance Insights */}
                        <Banner tone="info" title="Performance Insights" icon={CheckIcon}>
                            <List type="bullet">
                                <List.Item>
                                    <Text as="span" fontWeight="bold">Time Saved:</Text> Approximately {Math.floor(analytics.totalImagesProcessed * 2 / 60)} hours saved vs manual entry (est. 2 min/image).
                                </List.Item>
                                <List.Item>
                                    <Text as="span" fontWeight="bold">SEO Impact:</Text> {analytics.totalImagesProcessed} images are now fully indexable by search engines.
                                </List.Item>
                                {analytics.totalImagesFailed > 0 && (
                                    <List.Item>
                                        <Text as="span" fontWeight="bold" tone="critical">Attention Needed:</Text> {analytics.totalImagesFailed} images failed processing. Check the details below.
                                    </List.Item>
                                )}
                            </List>
                        </Banner>
                    </Layout.Section>

                    <Layout.Section>
                        <LegacyCard title="Recent Scan History">
                            <DataTable
                                columnContentTypes={[
                                    'text',
                                    'text',
                                    'numeric',
                                    'numeric',
                                    'numeric',
                                    'text',
                                ]}
                                headings={[
                                    'Date',
                                    'Status',
                                    'Products',
                                    'Processed',
                                    'Failed',
                                    'Duration'
                                ]}
                                rows={activityRows}
                                footerContent={`Showing last ${activityRows.length} scans`}
                            />
                            {activityRows.length === 0 && (
                                <Box padding="400">
                                    <Text as="p" tone="subdued" alignment="center">No scan history available.</Text>
                                </Box>
                            )}
                        </LegacyCard>
                    </Layout.Section>

                    {/* Trend Table (Simple Implementation) */}
                    {chartData.length > 0 && (
                        <Layout.Section>
                            <LegacyCard title="14-Day Performance Trend">
                                <DataTable
                                    columnContentTypes={[
                                        'text',
                                        'numeric',
                                        'numeric',
                                        'numeric'
                                    ]}
                                    headings={[
                                        'Date',
                                        'Scans Run',
                                        'Images Optimized',
                                        'Failed Count'
                                    ]}
                                    rows={trendRows}
                                />
                            </LegacyCard>
                        </Layout.Section>
                    )}
                </Layout>
            </BlockStack>
        </Page>
    );
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};
