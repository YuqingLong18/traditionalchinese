import type {
  AnalysisResult,
  GenerationType,
  HistoricalContextResult,
  ImageAsset,
  ImagePrompt,
} from '../types';
import { countCharacters, splitSentences, toSimplifiedChinese } from './text';

const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const EMPTY_ANALYSIS: AnalysisResult = { sentences: [] };
const EMPTY_HISTORY: HistoricalContextResult = { overview: '', recentEvents: [] };

export class ModelJsonError extends Error {
  rawContent: string;

  constructor(message: string, rawContent: string) {
    super(message);
    this.name = 'ModelJsonError';
    this.rawContent = rawContent;
  }
}

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
      token?: string;
      edits_remaining?: number;
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

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|[；;]+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }

  return [];
};

const normalizeAnalysisResult = (payload: AnalysisResult | undefined): AnalysisResult => {
  if (!payload || !Array.isArray(payload.sentences)) {
    return EMPTY_ANALYSIS;
  }

  const sentences = payload.sentences
    .map((sentence) => {
      const original = typeof sentence.original === 'string' ? sentence.original : '';
      const simplified = typeof sentence.simplified === 'string' ? sentence.simplified : '';
      const explanation = normalizeStringArray(sentence.explanation);

      if (!original && !simplified && explanation.length === 0) {
        return null;
      }

      return {
        original,
        simplified,
        explanation,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return { sentences };
};

const normalizeHistoricalContext = (payload: HistoricalContextResult | undefined): HistoricalContextResult => {
  if (!payload) {
    return EMPTY_HISTORY;
  }

  const overview = typeof payload.overview === 'string' ? payload.overview : '';
  const recentEvents = normalizeStringArray(payload.recentEvents);

  return {
    overview,
    recentEvents,
  };
};


const requestChatCompletion = async <T>(
  payload: ChatCompletionPayload,
  apiKey: string,
  resultType: GenerationType,
  fallbackValue: T,
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

  if (!rawContent) {
    return fallbackValue;
  }

  try {
    return tryParseJson<T>(rawContent);
  } catch (error) {
    throw new ModelJsonError('无法解析模型回复，请稍后再试。', rawContent);
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

interface ImageResponseMeta {
  token?: string;
}

const extractImageFromResponse = async (
  data: ChatCompletionResponse,
): Promise<{ base64: string; mimeType: string; meta: ImageResponseMeta }> => {
  const message = data.choices?.[0]?.message;
  
  // Debug logging (remove after fixing)
  console.log('Full message structure:', JSON.stringify(message, null, 2));
  
  const images = message?.images;
  let imageUrl = normalizeImageUrl(images?.[0]);

  // Try multiple fallback strategies
  if (!imageUrl && Array.isArray(message?.content)) {
    const imageContent = message.content.find((item) => item.type === 'image_url') as
      | { type: 'image_url'; image_url: string | { url?: string } }
      | undefined;
    imageUrl = normalizeImageUrl(imageContent?.image_url as ImagePayload | undefined);
  }
  
  // Additional fallback: check if content is a string with a data URL
  if (!imageUrl && typeof message?.content === 'string') {
    const dataUrlMatch = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUrlMatch) {
      imageUrl = dataUrlMatch[0];
    }
  }
  
  // Another fallback: check for url field directly in message
  if (!imageUrl && (message as any)?.url) {
    imageUrl = (message as any).url;
  }

  if (!imageUrl) {
    console.error('Could not find image URL in response:', data);
    throw new Error('模型响应缺少图像链接，请稍后再试。');
  }

  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);

  return {
    base64,
    mimeType,
    meta: {
      token: (message as { token?: string } | undefined)?.token,
    },
  };
};

const requestImageGeneration = async (
  prompt: string,
  apiKey: string,
  resultType: Extract<GenerationType, 'scene-images'>,
  retryCount = 0,
): Promise<{ base64: string; mimeType: string; token?: string }> => {
  const payload: ChatCompletionPayload = {
    model: 'google/gemini-2.5-flash-image-preview',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Generate an image based on this description: ${prompt}. Style: Traditional Chinese ink wash painting with flowing lines and ample white space. IMPORTANT: You must generate and return an actual image, not just text.`,
          },
        ],
      },
    ],
    modalities: ['image', 'text'],
    temperature: 0.7,
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
  
  // Check if image exists in response
  const message = data.choices?.[0]?.message;
  const hasImage = message?.images?.length || 
                   (Array.isArray(message?.content) && 
                    message.content.some(item => item.type === 'image_url'));
  
  if (!hasImage && retryCount < 2) {
    console.warn(`No image in response, retrying (attempt ${retryCount + 1})...`);
    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, 2000));
    return requestImageGeneration(prompt, apiKey, resultType, retryCount + 1);
  }
  
  const { base64, mimeType, meta } = await extractImageFromResponse(data);
  return { base64, mimeType, token: meta.token };
};

const requestImageEdit = async (
  baseImage: ImageAsset,
  editPrompt: string,
  apiKey: string,
  resultType: Extract<GenerationType, 'scene-images'>,
): Promise<{ base64: string; mimeType: string; token?: string }> => {
  if (!baseImage.token) {
    throw new Error('当前图像不支持继续编辑。');
  }

  const imageDataUrl = `data:${baseImage.mimeType};base64,${baseImage.base64Data}`;

  const payload: ChatCompletionPayload = {
    model: 'google/gemini-2.5-flash-image-preview',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${editPrompt}。请保持水墨质感与历史氛围。`,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
            },
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
    throw new Error(`OpenRouter ${resultType} 图像编辑失败：${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const { base64, mimeType, meta } = await extractImageFromResponse(data);
  return { base64, mimeType, token: meta.token };
};

const generateImagePrompts = async (
  apiKey: string,
  author: string,
  passage: string,
  type: Extract<GenerationType, 'scene-images'>,
  referenceSummary?: string,
): Promise<ImagePrompt[]> => {
  const simplifiedContent = toSimplifiedChinese(referenceSummary || passage);
  const expected = computeImageCount(referenceSummary || passage, type);

  const systemPrompt =
    '你是一位视觉分镜与图像提示词专家，请仅以 JSON 回复 {"scenes":[{"title":"","prompt":""},...]}。title 使用简体中文，精炼地概括画面；prompt 必须使用简体中文，约 60-120 字，描述画面主体、人物动作、环境氛围、构图与传统中国水墨画风格细节。场景数量限定为 4-8 条。';

  const userPrompt = `作品作者：${author || '未知'}\n原文（已转为简体便于理解）：${simplifiedContent}\n目标：生成 ${expected} 条场景描述，请突出关键画面与情绪变化。`;

  return requestChatCompletion<{ scenes: ImagePrompt[] }>(
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
    { scenes: [] },
  ).then((result) => {
    if (!Array.isArray(result.scenes) || result.scenes.length === 0) {
      throw new Error('模型未返回有效的图像场景，请尝试缩短或重写文本。');
    }
    return result.scenes.slice(0, 8);
  });
};

export const generateAnalysis = async (
  apiKey: string,
  author: string,
  passage: string,
): Promise<AnalysisResult> => {
  const systemPrompt =
    '你是一位精通文言文与现代汉语的教师。仅以 JSON 回复 {"sentences":[{"original":"","simplified":"","explanation":["",...]},...]}，其中 simplified 请提供贴合语境的现代汉语（简体）解释，explanation 以简体中文列出 3-5 个关键词释义。';

  const userPrompt = `请逐句解析下列文言文：\n作者：${author || '未知'}\n文本：${passage}\n要求：\n1. original：保持原句（繁体或文言格式）；\n2. simplified：转换为现代汉语（简体），含义准确；\n3. explanation：给出关键词、典故或修辞的简要说明。`;

  const rawResult = await requestChatCompletion<AnalysisResult>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      top_p: 0.8,
      max_output_tokens: 2048,
    },
    apiKey,
    'analysis',
    EMPTY_ANALYSIS,
  );

  const normalized = normalizeAnalysisResult(rawResult);
  if (normalized.sentences.length === 0) {
    throw new Error('模型未返回解析内容，请稍后再试。');
  }

  return normalized;
};

export const generateIllustrations = async (
  apiKey: string,
  author: string,
  passage: string,
  type: Extract<GenerationType, 'scene-images'>,
): Promise<ImageAsset[]> => {
  const scenes = await generateImagePrompts(apiKey, author, passage, type);

  const assets: ImageAsset[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const prompt = scene.prompt.trim();
    
    // Add delay between requests (except for the first one)
    if (index > 0) {
      console.log(`Waiting before generating image ${index + 1}...`);
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
    }
    
    console.log(`Generating image ${index + 1}/${scenes.length}...`);
    const { base64, mimeType, token } = await requestImageGeneration(prompt, apiKey, type);

    assets.push({
      id: `${type}-${index + 1}`,
      title: scene.title || `场景 ${index + 1}`,
      prompt,
      base64Data: base64,
      mimeType,
      token,
    });
  }

  return assets;
};

export const editIllustration = async (
  apiKey: string,
  baseImage: ImageAsset,
  editPrompt: string,
  type: Extract<GenerationType, 'scene-images'>,
): Promise<ImageAsset> => {
  const { base64, mimeType, token } = await requestImageEdit(baseImage, editPrompt, apiKey, type);

  return {
    ...baseImage,
    base64Data: base64,
    mimeType,
    prompt: `${baseImage.prompt}\n（修改：${editPrompt}）`,
    token: token ?? baseImage.token,
  };
};

export const generateHistoricalContext = async (
  apiKey: string,
  author: string,
  passage: string,
): Promise<HistoricalContextResult> => {
  const systemPrompt =
    '你是一位中国古典文学史教师，请仅以 JSON 回复 {"overview":"","recentEvents":["",...]}。overview 用简体中文概述作者生平要点（≤180 字）；recentEvents 至少 3 条，聚焦作品定稿前 1-3 年内的关键事件、社会环境或个人心境，并说明其与作品的关联。语气平实，适合课堂讲解。';

  const userPrompt = `作者：${author || '未知'}\n选取作品片段：${passage}\n任务：帮助学生理解该作品的历史背景与成稿前关键事件。`;

  const rawResult = await requestChatCompletion<HistoricalContextResult>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.45,
      top_p: 0.85,
      max_output_tokens: 2048,
    },
    apiKey,
    'history',
    EMPTY_HISTORY,
  );

  const result = normalizeHistoricalContext(rawResult);
  if (!result.overview && result.recentEvents.length === 0) {
    throw new Error('模型未返回历史背景，请稍后再试。');
  }

  return result;
};
