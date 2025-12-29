import db from "../db.server";

export type AltTextStyle = "professional" | "casual" | "technical" | "creative";
export type AltTextLength = "short" | "medium" | "long";

export type Settings = {
    altTextStyle: AltTextStyle;
    altTextLength: AltTextLength;
    customPrompt: string | null;
    batchSize: number;
    autoRetry: boolean;
    maxRetries: number;
};

const DEFAULT_SETTINGS: Settings = {
    altTextStyle: "professional",
    altTextLength: "medium",
    customPrompt: null,
    batchSize: 3,
    autoRetry: true,
    maxRetries: 3,
};

/**
 * Get user settings (creates default if not exists)
 */
export async function getSettings(shop: string): Promise<Settings> {
    let settings = await db.appSettings.findUnique({
        where: { shop },
    });

    if (!settings) {
        settings = await db.appSettings.create({
            data: {
                shop,
                ...DEFAULT_SETTINGS,
            },
        });
    }

    return {
        altTextStyle: settings.altTextStyle as AltTextStyle,
        altTextLength: settings.altTextLength as AltTextLength,
        customPrompt: settings.customPrompt,
        batchSize: settings.batchSize,
        autoRetry: settings.autoRetry,
        maxRetries: settings.maxRetries,
    };
}

/**
 * Update user settings
 */
export async function updateSettings(shop: string, settings: Partial<Settings>) {
    return await db.appSettings.upsert({
        where: { shop },
        update: settings,
        create: {
            shop,
            ...DEFAULT_SETTINGS,
            ...settings,
        },
    });
}

/**
 * Get the max character limit based on length preference
 */
export function getMaxLength(length: AltTextLength): number {
    switch (length) {
        case "short":
            return 60;
        case "medium":
            return 100;
        case "long":
            return 125;
        default:
            return 100;
    }
}

/**
 * Get style-specific prompt modifications
 */
export function getStylePrompt(style: AltTextStyle): string {
    switch (style) {
        case "professional":
            return "Use professional, formal language suitable for corporate/business contexts.";
        case "casual":
            return "Use friendly, conversational language that feels approachable and relatable.";
        case "technical":
            return "Use precise technical terminology and detailed specifications where relevant.";
        case "creative":
            return "Use vivid, descriptive language that paints a picture and engages the imagination.";
        default:
            return "Use clear, straightforward language.";
    }
}
