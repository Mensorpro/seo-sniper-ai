import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Form, useNavigation, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { generateAltText } from "../services/gemini.server";
import { createScanHistory, completeScanHistory, recordImageProcessing } from "../services/analytics.server";
import { getSettings } from "../services/settings.server";
import { addFailedJob, isRetryableError } from "../services/retry.server";
import { fetchAllProducts } from "../services/pagination.server";

import {
  Page,
  Layout,
  LegacyCard,
  Grid,
  Banner,
  BlockStack,
  Text,
  Button,
  ProgressBar,
  Box,
  InlineStack,
  Badge,
  List,
  Thumbnail,
  Card,
  Bleed,
  Divider,
  ResourceList,
  ResourceItem
} from "@shopify/polaris";
import {
  WandIcon,
  RefreshIcon,
  ImageIcon,
  AlertCircleIcon,
  CheckIcon
} from "@shopify/polaris-icons";
import { useState, useEffect, useRef } from "react";

// Define types for the GraphQL response
interface MediaImage {
  id: string;
  image: {
    url: string;
  } | null;
  alt: string | null;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  media: {
    edges: Array<{
      node: MediaImage;
    }>;
  };
}

interface ProductsQueryResponse {
  data?: {
    products: {
      edges: Array<{
        node: ProductNode;
      }>;
    };
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Fetch products with their media (using MediaImage IDs for updates)
  const response = await admin.graphql(
    `#graphql
      query getProductsWithMedia {
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              tags
              media(first: 10) {
                edges {
                  node {
                    ... on MediaImage {
                      id
                      alt
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`
  );

  const responseJson: ProductsQueryResponse = await response.json();
  const products = responseJson.data?.products.edges.map((edge) => edge.node) || [];

  return { products };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const forceAll = formData.get("forceAll") === "true";
  const settings = await getSettings(session.shop);
  const scanRecord = await createScanHistory(session.shop, forceAll);

  const response = await admin.graphql(
    `#graphql
      query getProductsWithMedia {
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              tags
              media(first: 10) {
                edges {
                  node {
                    ... on MediaImage {
                      id
                      alt
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`
  );

  const responseJson: ProductsQueryResponse = await response.json();
  const products = responseJson.data?.products.edges.map((edge) => edge.node) || [];

  let totalImages = 0;
  let missingAltText = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (const [index, product] of products.entries()) {
    const imageMedia = product.media.edges.filter(m => m.node.image);

    if (imageMedia.length === 0) {
      continue;
    }

    for (const [imgIndex, mediaEdge] of imageMedia.entries()) {
      totalImages++;
      const mediaId = mediaEdge.node.id;
      const imageUrl = mediaEdge.node.image!.url;
      const currentAltText = mediaEdge.node.alt;

      if (!forceAll && currentAltText && currentAltText.trim() !== "") {
        continue;
      }

      missingAltText++;

      try {
        const newAltText = await generateAltText(imageUrl, product.title, product.tags, session.shop, settings.maxRetries);

        if (!newAltText) {
          errorCount++;
          await recordImageProcessing({
            scanId: scanRecord.id,
            productId: product.id,
            productTitle: product.title,
            imageId: mediaId,
            imageUrl,
            oldAltText: currentAltText,
            newAltText: "",
            status: "failed",
            errorMessage: "No alt-text generated"
          });

          if (settings.autoRetry) {
            await addFailedJob({
              shop: session.shop,
              productId: product.id,
              productTitle: product.title,
              imageId: mediaId,
              imageUrl,
              errorMessage: "No alt-text generated",
              maxRetries: settings.maxRetries
            });
          }
          continue;
        }

        const updateResponse = await admin.graphql(
          `#graphql
            mutation updateProductMediaAltText($productId: ID!, $media: [UpdateMediaInput!]!) {
              productUpdateMedia(productId: $productId, media: $media) {
                media {
                  ... on MediaImage {
                    id
                    alt
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
          {
            variables: {
              productId: product.id,
              media: [{
                id: mediaId,
                alt: newAltText
              }]
            }
          }
        );

        const updateResult = await updateResponse.json();

        if (updateResult.data?.productUpdateMedia?.userErrors?.length > 0) {
          errorCount++;
        } else {
          updatedCount++;
          await recordImageProcessing({
            scanId: scanRecord.id,
            productId: product.id,
            productTitle: product.title,
            imageId: mediaId,
            imageUrl,
            oldAltText: currentAltText,
            newAltText,
            status: "success"
          });
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error: any) {
        errorCount++;
        await recordImageProcessing({
          scanId: scanRecord.id,
          productId: product.id,
          productTitle: product.title,
          imageId: mediaId,
          imageUrl,
          oldAltText: currentAltText,
          newAltText: "",
          status: "failed",
          errorMessage: error.message
        });

        if (settings.autoRetry && isRetryableError(error)) {
          await addFailedJob({
            shop: session.shop,
            productId: product.id,
            productTitle: product.title,
            imageId: mediaId,
            imageUrl,
            errorMessage: error.message,
            maxRetries: settings.maxRetries
          });
        }
      }
    }
  }

  await completeScanHistory(scanRecord.id, {
    totalProducts: products.length,
    totalImages,
    imagesProcessed: updatedCount,
    imagesSkipped: totalImages - missingAltText,
    imagesFailed: errorCount
  });

  return { totalImages, missingAltText, updatedCount, errorCount };
};

export default function TestProducts() {
  const { products } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";





  const missingCount = products.reduce((count, product) => {
    return count + product.media.edges.filter(m => m.node.image && (!m.node.alt || m.node.alt.trim() === "")).length;
  }, 0);

  const totalImages = products.reduce((count, product) => count + product.media.edges.filter(m => m.node.image).length, 0);

  const handleSubmit = (force = false) => {
    const formData = new FormData();
    if (force) formData.append("forceAll", "true");
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="AI Processing Center"
      backAction={{ content: 'Dashboard', url: '/app' }}
    >
      <Layout>
        <Layout.Section>
          <Banner
            title={missingCount > 0 ? `${missingCount} images require optimization` : "All images are optimized"}
            tone={missingCount > 0 ? "warning" : "success"}
            icon={missingCount > 0 ? AlertCircleIcon : CheckIcon}
          >
            <p>{missingCount > 0 ? "Start a scan to generate SEO-friendly alt text for your products." : "Great job! Your catalog is fully optimized."}</p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 8, xl: 8 }}>
              <LegacyCard title="Mission Control" sectioned>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">Scan Status</Text>
                      <Text as="p" tone="subdued">
                        {isSubmitting ? "Processing images via Gemini AI..." : "Ready to launch"}
                      </Text>
                    </BlockStack>
                    <Badge tone={isSubmitting ? "info" : "success"}>
                      {isSubmitting ? "ACTIVE" : "IDLE"}
                    </Badge>
                  </InlineStack>

                  {isSubmitting && <ProgressBar progress={undefined} tone="primary" />}

                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      size="large"
                      icon={WandIcon}
                      onClick={() => handleSubmit(false)}
                      loading={isSubmitting}
                      disabled={missingCount === 0}
                    >
                      {`Snipe Missing (${missingCount})`}
                    </Button>

                    <Button
                      variant="secondary"
                      size="large"
                      icon={RefreshIcon}
                      onClick={() => handleSubmit(true)}
                      loading={isSubmitting}
                    >
                      Force Update All
                    </Button>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>

            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <LegacyCard title="Catalog Overview" sectioned>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="span">Products</Text>
                    <Text as="span" fontWeight="bold">{`${products.length}`}</Text>
                  </InlineStack>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span">Total Images</Text>
                    <Text as="span" fontWeight="bold">{`${totalImages}`}</Text>
                  </InlineStack>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span">Missing Alt-Text</Text>
                    <Badge tone={missingCount > 0 ? "critical" : "success"}>{`${missingCount}`}</Badge>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            </Grid.Cell>
          </Grid>
        </Layout.Section>



        <Layout.Section>
          <LegacyCard title="Target List (First 10 Products)">
            <ResourceList
              resourceName={{ singular: 'product', plural: 'products' }}
              items={products.slice(0, 10)}
              renderItem={(item) => {
                const image = item.media.edges.find(m => m.node.image);
                const missingImages = item.media.edges.filter(m => m.node.image && !m.node.alt).length;

                return (
                  <Box padding="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="400" blockAlign="center">
                        <Thumbnail
                          source={image?.node.image?.url || ImageIcon}
                          alt={image?.node.alt || item.title}
                        />
                        <BlockStack gap="050">
                          <Text as="h3" variant="headingSm">{item.title}</Text>
                          <Text as="p" tone="subdued">{item.media.edges.length} images</Text>
                        </BlockStack>
                      </InlineStack>
                      {missingImages > 0 ? (
                        <Badge tone="warning">{`${missingImages} Missing Alt`}</Badge>
                      ) : (
                        <Badge tone="success">Optimized</Badge>
                      )}
                    </InlineStack>
                  </Box>
                );
              }}
            />
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
