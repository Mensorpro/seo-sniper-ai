import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getAnalytics, getRecentActivity } from "../services/analytics.server";
import { getSettings } from "../services/settings.server";
import { getAllFailedJobs } from "../services/retry.server";

import {
  Page,
  Layout,
  LegacyCard,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  Grid,
  Box,
  Divider,
  ResourceList,
  ResourceItem,
  Avatar,
  Card,
  ProgressBar
} from "@shopify/polaris";
import {
  ChartVerticalIcon,
  WandIcon,
  SettingsIcon,
  PlusIcon,
  ProductIcon,
  AlertCircleIcon
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const analytics = await getAnalytics(session.shop);
  const recentActivity = await getRecentActivity(session.shop, 5);
  const settings = await getSettings(session.shop);
  const failedJobs = await getAllFailedJobs(session.shop);
  const pendingRetries = failedJobs.filter(j => j.status === "pending").length;

  return {
    analytics,
    recentActivity,
    settings,
    pendingRetries,
    shop: session.shop
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data!.productCreate!.product!;
  const variantId = product.variants.edges[0]!.node!.id!;

  await admin.graphql(
    `#graphql
    mutation updateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  return { product: responseJson!.data!.productCreate!.product };
};

export default function Index() {
  const { analytics, recentActivity, settings, pendingRetries } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <Page title="Dashboard" fullWidth>
      <BlockStack gap="800">

        {/* Top Stats Grid */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <LegacyCard sectioned>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">Total Scans</Text>
                <Text as="p" variant="heading2xl">{analytics.totalScans}</Text>
              </BlockStack>
            </LegacyCard>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <LegacyCard sectioned>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">Images Processed</Text>
                <Text as="p" variant="heading2xl" tone="success">
                  {analytics.totalImagesProcessed}
                </Text>
              </BlockStack>
            </LegacyCard>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <LegacyCard sectioned>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">Success Rate</Text>
                <Text as="p" variant="heading2xl" tone={analytics.successRate >= 90 ? "success" : "critical"}>
                  {analytics.successRate.toFixed(1)}%
                </Text>
              </BlockStack>
            </LegacyCard>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <LegacyCard sectioned>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">Pending Retries</Text>
                <InlineStack align="start" blockAlign="center" gap="200">
                  <Text as="p" variant="heading2xl" tone={pendingRetries > 0 ? "critical" : "subdued"}>
                    {pendingRetries}
                  </Text>
                  {pendingRetries > 0 && <Badge tone="critical">Action Required</Badge>}
                </InlineStack>
              </BlockStack>
            </LegacyCard>
          </Grid.Cell>
        </Grid>

        <Layout>
          {/* Main Content Column */}
          <Layout.Section>

            {/* Quick Actions Banner (if no scans) */}
            {analytics.totalScans === 0 && (
              <Banner
                title="Welcome to SEO-Sniper-AI!"
                action={{ content: 'Start First Scan', onAction: () => navigate("/app/test-products") }}
                tone="info"
              >
                <p>Get started by scanning your products to automatically generate SEO-optimized alt text.</p>
              </Banner>
            )}

            {/* Recent Activity */}
            <LegacyCard title="Recent Activity" actions={[{ content: 'View All', onAction: () => navigate("/app/analytics") }]}>
              <ResourceList
                resourceName={{ singular: 'scan', plural: 'scans' }}
                items={recentActivity}
                renderItem={(item: any) => {
                  const { id, startedAt, imagesProcessed, imagesFailed, status } = item;

                  return (
                    <ResourceItem
                      id={id}
                      onClick={() => navigate("/app/analytics")}
                      media={
                        <Avatar customer size="md" name={status} source={status === 'completed' ? "" : ""} />
                      }
                      accessibilityLabel={`View details for scan from ${new Date(startedAt).toLocaleDateString()}`}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <Box>
                          <Text variant="bodyMd" fontWeight="bold" as="h3">
                            {status === 'running' ? 'Processing...' : status === 'completed' ? 'Scan Completed' : 'Scan Completed with Errors'}
                          </Text>
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm" tone="subdued">{new Date(startedAt).toLocaleString()}</Text>
                            <Text as="p" variant="bodySm">
                              {imagesProcessed} processed • {imagesFailed} failed
                            </Text>
                          </BlockStack>
                        </Box>
                        <Badge tone={status === 'completed' ? 'success' : status === 'running' ? 'info' : 'warning'}>
                          {status.replace("_", " ").toUpperCase()}
                        </Badge>
                      </InlineStack>
                    </ResourceItem>
                  );
                }}
              />
              {recentActivity.length === 0 && (
                <Box padding="400">
                  <Text as="p" tone="subdued" alignment="center">No recent activity found.</Text>
                </Box>
              )}
            </LegacyCard>
          </Layout.Section>

          {/* Sidebar Column */}
          <Layout.Section variant="oneThird">

            {/* Quick Navigation Card */}
            <LegacyCard title="Quick Actions" sectioned>
              <BlockStack gap="400">
                <Button
                  variant="primary"
                  fullWidth
                  icon={WandIcon}
                  onClick={() => navigate("/app/test-products")}
                  size="large"
                >
                  Start Sniping
                </Button>
                <Button fullWidth icon={ChartVerticalIcon} onClick={() => navigate("/app/analytics")}>
                  View Analytics
                </Button>
                <Button fullWidth icon={SettingsIcon} onClick={() => navigate("/app/settings")}>
                  Configure Settings
                </Button>
              </BlockStack>
            </LegacyCard>

            {/* Configuration Summary */}
            <LegacyCard title="Current Configuration" sectioned>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Style</Text>
                  <Badge>{settings.altTextStyle}</Badge>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Length</Text>
                  <Badge>{settings.altTextLength}</Badge>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Batch</Text>
                  <Text as="span" fontWeight="bold">{settings.batchSize}</Text>
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Auto-Retry</Text>
                  <Text as="span" tone={settings.autoRetry ? "success" : "critical"}>
                    {settings.autoRetry ? "Enabled" : "Disabled"}
                  </Text>
                </InlineStack>
              </BlockStack>
              <Box paddingBlockStart="400">
                <Button fullWidth variant="plain" onClick={() => navigate("/app/settings")}>Edit Configuration</Button>
              </Box>
            </LegacyCard>

            {/* Test Tools */}
            <LegacyCard title="Test Tools" sectioned>
              <Text as="p" variant="bodySm" tone="subdued">
                Generate a sample product to verify connectivity and image processing.
              </Text>
              <Box paddingBlockStart="400">
                <Button
                  fullWidth
                  loading={isLoading}
                  onClick={generateProduct}
                  icon={PlusIcon}
                >
                  Generate Product
                </Button>
              </Box>
            </LegacyCard>

          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
