import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSettings, getMaxLength, getStylePrompt, type AltTextStyle, type AltTextLength } from "./settings.server";
import { calculateBackoffDelay } from "./retry.server";

export const generateAltText = async (
  imageUrl: string,
  productTitle: string,
  productTags: string[],
  shop: string,
  maxRetries: number = 3
) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment variables.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Get user settings for customization
  const settings = await getSettings(shop);
  const maxLength = getMaxLength(settings.altTextLength);
  const stylePrompt = getStylePrompt(settings.altTextStyle);

  let lastError: any = null;

  // Retry logic with exponential backoff
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Fetch the image and convert to base64
      const imageResp = await fetch(imageUrl).then((res) => res.arrayBuffer());

      // Build the prompt based on user settings
      const prompt = settings.customPrompt || buildDefaultPrompt({
        productTitle,
        productTags,
        maxLength,
        stylePrompt,
      });

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: Buffer.from(imageResp).toString("base64"),
            mimeType: "image/jpeg",
          },
        },
      ]);

      // Sanitize the AI output: trim, strip surrounding quotes, enforce max length
      let alt = result.response.text().trim();
      // remove surrounding single/double quotes if present
      alt = alt.replace(/^['\"]+|['\"]+$/g, "");
      // normalize whitespace
      alt = alt.replace(/\s+/g, ' ').trim();
      // enforce maximum based on user preference
      if (alt.length > maxLength) {
        alt = alt.slice(0, maxLength - 3).trim() + '...';
      }

      return alt; // Success!

    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error
      if (error.status === 429 || /rate limit/i.test(error.message)) {
        console.log(`⚠️ Rate limit hit on attempt ${attempt + 1}/${maxRetries}`);

        if (attempt < maxRetries - 1) {
          const delay = calculateBackoffDelay(attempt);
          console.log(`   ⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }
      } else if (attempt < maxRetries - 1) {
        // Other errors - still retry but with shorter delay
        const delay = 1000 * (attempt + 1);
        console.log(`   ⚠️ Error on attempt ${attempt + 1}: ${error.message}`);
        console.log(`   ⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // All retries failed
  if (lastError?.status === 429) {
    throw new Error("Rate limit exceeded - retry later");
  }

  console.error("Error generating alt-text with Gemini after retries:", lastError);
  throw new Error(`Failed to generate alt-text: ${lastError?.message || "Unknown error"}`);
};

/**
 * Build default prompt based on settings
 */
function buildDefaultPrompt(params: {
  productTitle: string;
  productTags: string[];
  maxLength: number;
  stylePrompt: string;
}): string {
  const { productTitle, productTags, maxLength, stylePrompt } = params;

  return `You are an accessibility-and-SEO-focused alt-text writer. Produce ONE concise, factual, non-promotional sentence that is professional and suitable for screen readers while also helping discoverability.

Requirements:
- Start with the object (for example: "Blue snowboard...")
- Include the color and the most important design elements (e.g. "liquid-drip design", "winter forest landscape graphic").
- If the product title contains a clear brand or model name, include it once naturally (for example: "Blue Liquid snowboard..."); otherwise do not force brand names.
- Avoid marketing language, calls-to-action, prices, or unnecessary adjectives.
- Keep it under ${maxLength} characters (strict limit).
- ${stylePrompt}
- Use plain, descriptive language suitable for screen readers.

Return ONLY the single alt-text sentence with no surrounding quotes or extra commentary.

Context:
Product title: "${productTitle}"
Product tags: ${productTags.join(", ")}
`;
}

