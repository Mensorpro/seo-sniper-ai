/**
 * Pagination utilities for Shopify GraphQL cursor-based pagination
 */

export interface PageInfo {
    hasNextPage: boolean;
    endCursor: string | null;
}

export interface ProductNode {
    id: string;
    title: string;
    handle: string;
    tags: string[];
    media: {
        edges: Array<{
            node: {
                id: string;
                alt: string | null;
                image: {
                    url: string;
                } | null;
            };
        }>;
    };
}

export interface ProductsResponse {
    data: {
        products: {
            edges: Array<{
                node: ProductNode;
                cursor: string;
            }>;
            pageInfo: PageInfo;
        };
    };
}

const PRODUCTS_QUERY = `#graphql
  query getProductsWithMedia($first: Int!, $after: String) {
    products(first: $first, after: $after) {
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
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Fetch a single page of products
 */
export async function fetchProductsPage(
    admin: any,
    pageSize: number = 250,
    cursor: string | null = null
): Promise<ProductsResponse> {
    const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: {
            first: pageSize,
            after: cursor,
        },
    });

    return await response.json();
}

/**
 * Fetch all products using cursor-based pagination
 */
export async function fetchAllProducts(
    admin: any,
    pageSize: number = 250,
    onProgress?: (products: ProductNode[], totalFetched: number) => void
): Promise<ProductNode[]> {
    let allProducts: ProductNode[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const result = await fetchProductsPage(admin, pageSize, cursor);
        const products = result.data.products.edges.map((edge) => edge.node);

        allProducts = [...allProducts, ...products];

        if (onProgress) {
            onProgress(products, allProducts.length);
        }

        hasNextPage = result.data.products.pageInfo.hasNextPage;
        cursor = result.data.products.pageInfo.endCursor;
    }

    return allProducts;
}

/**
 * Fetch products in batches for processing
 */
export async function* fetchProductsBatched(
    admin: any,
    pageSize: number = 250
): AsyncGenerator<ProductNode[], void, unknown> {
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const result = await fetchProductsPage(admin, pageSize, cursor);
        const products = result.data.products.edges.map((edge) => edge.node);

        yield products;

        hasNextPage = result.data.products.pageInfo.hasNextPage;
        cursor = result.data.products.pageInfo.endCursor;
    }
}

/**
 * Count total products (approximation using first page)
 */
export async function countProducts(admin: any): Promise<number> {
    // Shopify doesn't provide a direct count, so we estimate from the first page
    const result = await fetchProductsPage(admin, 1);

    // If there's a next page, we know there's more than 1
    if (result.data.products.pageInfo.hasNextPage) {
        // For a more accurate count, we'd need to fetch all pages
        // For now, return a conservative estimate
        return 250; // Indicate "many products"
    }

    return result.data.products.edges.length;
}
