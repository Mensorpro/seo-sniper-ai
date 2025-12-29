import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getSettings, updateSettings } from "../services/settings.server";
import {
    Page,
    Layout,
    LegacyCard,
    FormLayout,
    TextField,
    Select,
    RangeSlider,
    Checkbox,
    Button,
    BlockStack,
    Text,
    Box,
    Banner,
    InlineStack,
    Divider,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const settings = await getSettings(session.shop);

    return { settings, shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const settings = {
        altTextStyle: formData.get("altTextStyle") as any,
        altTextLength: formData.get("altTextLength") as any,
        customPrompt: formData.get("customPrompt") as string || null,
        batchSize: parseInt(formData.get("batchSize") as string),
        autoRetry: formData.get("autoRetry") === "true",
        maxRetries: parseInt(formData.get("maxRetries") as string),
    };

    await updateSettings(session.shop, settings);

    return { success: true, settings };
};

export default function Settings() {
    const { settings } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const submit = useSubmit();
    const shopify = useAppBridge();
    const isSubmitting = navigation.state === "submitting";

    // State for local form handling
    const [altTextStyle, setAltTextStyle] = useState(settings.altTextStyle);
    const [altTextLength, setAltTextLength] = useState(settings.altTextLength);
    const [customPrompt, setCustomPrompt] = useState(settings.customPrompt || "");
    const [batchSize, setBatchSize] = useState(settings.batchSize);
    const [autoRetry, setAutoRetry] = useState(settings.autoRetry);
    const [maxRetries, setMaxRetries] = useState(settings.maxRetries);

    const handleSubmit = useCallback(() => {
        const formData = new FormData();
        formData.append("altTextStyle", altTextStyle);
        formData.append("altTextLength", altTextLength);
        if (customPrompt) formData.append("customPrompt", customPrompt);
        formData.append("batchSize", batchSize.toString());
        formData.append("autoRetry", autoRetry.toString());
        formData.append("maxRetries", maxRetries.toString());

        submit(formData, { method: "post" });
        shopify.toast.show("Settings saved successfully");
    }, [altTextStyle, altTextLength, customPrompt, batchSize, autoRetry, maxRetries, submit, shopify]);

    const styleOptions = [
        { label: 'Professional (Corporate/Formal)', value: 'professional' },
        { label: 'Casual (Friendly/Conversational)', value: 'casual' },
        { label: 'Technical (Precise/Spec-heavy)', value: 'technical' },
        { label: 'Creative (Vivid/Descriptive)', value: 'creative' },
    ];

    const lengthOptions = [
        { label: 'Short (up to 60 chars)', value: 'short' },
        { label: 'Medium (up to 100 chars)', value: 'medium' },
        { label: 'Long (up to 125 chars)', value: 'long' },
    ];

    return (
        <Page
            title="Settings"
            backAction={{ content: 'Dashboard', url: '/app' }}
            primaryAction={{
                content: 'Save Settings',
                onAction: handleSubmit,
                loading: isSubmitting,
            }}
        >
            <Layout>
                <Layout.AnnotatedSection
                    title="AI Personality"
                    description="Customize how the AI writes alt text for your products. Choose a tone that matches your brand."
                >
                    <LegacyCard sectioned>
                        <FormLayout>
                            <Select
                                label="Tone of Voice"
                                options={styleOptions}
                                onChange={(value) => setAltTextStyle(value as any)}
                                value={altTextStyle}
                                helpText="This determines the writing style of the generated alt text."
                            />
                            <Select
                                label="Length Preference"
                                options={lengthOptions}
                                onChange={(value) => setAltTextLength(value as any)}
                                value={altTextLength}
                                helpText="Recommended: Medium for best SEO balance."
                            />
                            <TextField
                                label="Custom Prompt Instructions (Advanced)"
                                value={customPrompt}
                                onChange={setCustomPrompt}
                                multiline={4}
                                autoComplete="off"
                                helpText="Add specific rules like 'Always mention the brand name' or 'Do not use color names'."
                                placeholder="Enter custom instructions..."
                            />
                        </FormLayout>
                    </LegacyCard>
                </Layout.AnnotatedSection>

                <Layout.AnnotatedSection
                    title="Processing Rules"
                    description="Configure how the app handles batch processing and errors."
                >
                    <LegacyCard sectioned>
                        <FormLayout>
                            <RangeSlider
                                label="Concurrent Batch Size"
                                min={1}
                                max={10}
                                value={batchSize}
                                onChange={(value) => setBatchSize(Number(value))}
                                output
                                helpText={`Process ${batchSize} images simultaneously. Higher values are faster but may hit API limits.`}
                            />

                            <Divider />

                            <Checkbox
                                label="Enable Auto-Retry System"
                                checked={autoRetry}
                                onChange={setAutoRetry}
                                helpText="Automatically attempt to re-process failed images due to network or timeout issues."
                            />

                            {autoRetry && (
                                <TextField
                                    label="Max Retry Attempts"
                                    type="number"
                                    value={maxRetries.toString()}
                                    onChange={(val) => setMaxRetries(parseInt(val) || 1)}
                                    autoComplete="off"
                                    min={1}
                                    max={10}
                                    helpText="How many times to retry a failed image before giving up."
                                />
                            )}
                        </FormLayout>
                    </LegacyCard>
                </Layout.AnnotatedSection>

                <Layout.Section>
                    <Box paddingBlockStart="400">
                        <InlineStack align="end">
                            <Button variant="primary" size="large" onClick={handleSubmit} loading={isSubmitting}>
                                Save Settings
                            </Button>
                        </InlineStack>
                    </Box>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};
