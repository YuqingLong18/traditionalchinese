import type {
  AnalysisResult,
  AuthorBackgroundResult,
  GenerationType,
  ImageAsset,
  ImagePrompt,
} from '../types';
import { countCharacters, splitSentences, toSimplifiedChinese } from './text';

const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

type ChatMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: string | { url?: string } }
    >;

interface ChatCompletionPayload {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: ChatMessageContent;
  }>;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  modalities?: string[];
}

type ImagePayload =
  | string
  | {
      url?: string;
      image_url?: string | { url?: string };
    };

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: ChatMessageContent;
      images?: ImagePayload[];
    };
  }>;
}

const createHeaders = (apiKey: string): HeadersInit => {
  if (!apiKey) {
    throw new Error('缺少 OpenRouter API Key。');
  }

  const referer = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': referer,
    'X-Title': 'Traditional Chinese Literature Teaching Aid',
  };
};

const extractTextContent = (
  choiceContent: ChatMessageContent | undefined,
): string => {
  if (!choiceContent) {
    return '';
  }

  if (typeof choiceContent === 'string') {
    return choiceContent;
  }

  const textItems = choiceContent.filter(
    (item): item is { type: 'text'; text: string } =>
      item.type === 'text' && typeof (item as { text?: unknown }).text === 'string',
  );

  return textItems.map((item) => item.text).join('\n');
};

const tryParseJson = <T>(raw: string): T => {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : trimmed;
  return JSON.parse(candidate) as T;
};

const requestChatCompletion = async <T>(
  payload: ChatCompletionPayload,
  apiKey: string,
  resultType: GenerationType,
): Promise<T> => {
  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter ${resultType} 请求失败：${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const rawContent = extractTextContent(data.choices?.[0]?.message?.content) || '';

  try {
    return tryParseJson<T>(rawContent);
  } catch (error) {
    console.error('Failed to parse JSON response.', rawContent, error);
    throw new Error('无法解析模型回复，请稍后再试。');
  }
};

const computeImageCount = (content: string, type: GenerationType): number => {
  const sentences = splitSentences(content);
  const characters = countCharacters(content);

  const base = type === 'scene-images' ? sentences.length : Math.max(4, Math.round(sentences.length / 2));
  const scaled = Math.min(8, Math.max(4, Math.round(characters / 80)));
  const estimate = Math.round((base + scaled) / 2);

  return Math.max(4, Math.min(8, estimate));
};

const parseDataUrl = (input: string): { base64: string; mimeType: string } | null => {
  if (!input.startsWith('data:')) {
    return null;
  }

  const [, metaAndData] = input.split('data:');
  if (!metaAndData) {
    return null;
  }

  const [meta, data] = metaAndData.split(',', 2);
  if (!data) {
    return null;
  }

  const mimeType = meta.split(';')[0] || 'image/png';
  return {
    base64: meta.includes(';base64') ? data : btoa(decodeURIComponent(data)),
    mimeType,
  };
};

const normalizeImageUrl = (payload: ImagePayload | undefined): string | undefined => {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (payload.url) {
    return payload.url;
  }

  const imageSlot = payload.image_url;
  if (typeof imageSlot === 'string') {
    return imageSlot;
  }

  if (imageSlot && typeof imageSlot === 'object' && imageSlot.url) {
    return imageSlot.url;
  }

  return undefined;
};

const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
  const dataUrl = parseDataUrl(url);
  if (dataUrl) {
    return dataUrl;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载图像失败：${response.status}`);
  }
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return { base64, mimeType: blob.type || 'image/png' };
};

const requestImageGeneration = async (
  prompt: string,
  apiKey: string,
  resultType: Extract<GenerationType, 'story-images' | 'scene-images'>,
): Promise<{ base64: string; mimeType: string }> => {
  const payload: ChatCompletionPayload = {
    model: 'google/gemini-2.5-flash-image-preview',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${prompt}。风格：传统中国水墨画，线条洒脱，留白充足。`,
          },
        ],
      },
    ],
    modalities: ['image', 'text'],
  };

  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter ${resultType} 图像请求失败：${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const message = data.choices?.[0]?.message;
  const images = message?.images;

  let imageUrl = normalizeImageUrl(images?.[0]);

  if (!imageUrl && Array.isArray(message?.content)) {
    const imageContent = message.content.find((item) => item.type === 'image_url') as
      | { type: 'image_url'; image_url: string | { url?: string } }
      | undefined;
    imageUrl = normalizeImageUrl(imageContent?.image_url as ImagePayload | undefined);
  }

  if (!imageUrl) {
    throw new Error('模型响应缺少图像链接，请稍后再试。');
  }

  return fetchImageAsBase64(imageUrl);
};

const generateImagePrompts = async (
  apiKey: string,
  author: string,
  passage: string,
  type: Extract<GenerationType, 'story-images' | 'scene-images'>,
  referenceSummary?: string,
): Promise<ImagePrompt[]> => {
  const simplifiedContent = toSimplifiedChinese(referenceSummary || passage);
  const expected = computeImageCount(referenceSummary || passage, type);

  const systemPrompt =
    '你是一位视觉分镜与图像提示词专家，请仅以 JSON 回复 {"scenes":[{"title":"","prompt":""},...]}。title 使用简体中文，精炼地概括画面；prompt 必须使用简体中文，约 60-120 字，描述画面主体、人物动作、环境氛围、构图与传统中国水墨画风格细节。场景数量限定为 4-8 条。';

  const focus =
    type === 'scene-images'
      ? '请拆解原作内容，突出关键画面和情绪变化。'
      : '请依据作者经历与历史背景，描绘故事化的关键片段。';

  const userPrompt = `作品作者：${author || '未知'}\n原文（已转为简体便于理解）：${simplifiedContent}\n目标：生成 ${expected} 条场景描述。${focus}`;

  const result = await requestChatCompletion<{ scenes: ImagePrompt[] }>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      top_p: 0.85,
      max_output_tokens: 768,
    },
    apiKey,
    'image-prompts',
  );

  if (!Array.isArray(result.scenes) || result.scenes.length === 0) {
    throw new Error('模型未返回有效的图像场景，请尝试缩短或重写文本。');
  }

  return result.scenes.slice(0, 8);
};

export const generateAnalysis = async (
  apiKey: string,
  author: string,
  passage: string,
): Promise<AnalysisResult> => {
  const systemPrompt =
    '你是一位精通文言文与现代汉语的教师。仅以 JSON 回复 {"sentences":[{"original":"","simplified":"","explanation":["",...]},...]}，其中 simplified 请提供贴合语境的现代汉语（简体）解释，explanation 以简体中文列出 3-5 个关键词释义。';

  const userPrompt = `请逐句解析下列文言文：\n作者：${author || '未知'}\n文本：${passage}\n要求：\n1. original：保持原句（繁体或文言格式）；\n2. simplified：转换为现代汉语（简体），含义准确；\n3. explanation：给出关键词、典故或修辞的简要说明。`;

  return requestChatCompletion<AnalysisResult>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      top_p: 0.8,
      max_output_tokens: 1024,
    },
    apiKey,
    'analysis',
  );
};

export const generateAuthorBackground = async (
  apiKey: string,
  author: string,
  passage: string,
): Promise<AuthorBackgroundResult> => {
  const systemPrompt =
    '你是一位中国古典文学教师。请用 JSON 回复 {"biography":"","keyEvents":[...],"historicalContext":[...]}，全部使用简体中文。biography 限制在 150-200 字，keyEvents 与 historicalContext 各提供 3-5 条。';

  const userPrompt = `请梳理作者背景与作品脉络：\n作者：${author || '未知'}\n原文摘录：${passage}\n输出须包含简介、生平大事与历史背景。`;

  return requestChatCompletion<AuthorBackgroundResult>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      top_p: 0.85,
      max_output_tokens: 768,
    },
    apiKey,
    'author',
  );
};

export const generateIllustrations = async (
  apiKey: string,
  author: string,
  passage: string,
  type: Extract<GenerationType, 'story-images' | 'scene-images'>,
  referenceSummary?: string,
): Promise<ImageAsset[]> => {
  const scenes = await generateImagePrompts(apiKey, author, passage, type, referenceSummary);

  const assets: ImageAsset[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const prompt = scene.prompt.trim();
    const { base64, mimeType } = await requestImageGeneration(prompt, apiKey, type);

    assets.push({
      id: `${type}-${index + 1}`,
      title: scene.title || `场景 ${index + 1}`,
      prompt,
      base64Data: base64,
      mimeType,
    });
  }

  return assets;
};
