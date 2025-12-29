import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

import "@shopify/polaris/build/esm/styles.css";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { Link as ReactRouterLink } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations} linkComponent={Link}>
        <s-app-nav>
          <s-link href="/app">🏠 Dashboard</s-link>
          <s-link href="/app/test-products">🎯 Processing</s-link>
          <s-link href="/app/analytics">📊 Analytics</s-link>
          <s-link href="/app/settings">⚙️ Settings</s-link>
          <s-link href="/app/additional">📄 Additional</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

function Link({ children, url = "", external, ref, ...rest }: any) {
  // react-router only supports relative links, so we need to check if the link is external
  if (external || url.startsWith("http")) {
    return (
      <a target="_blank" rel="noopener noreferrer" href={url} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <ReactRouterLink to={url} {...rest}>
      {children}
    </ReactRouterLink>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
