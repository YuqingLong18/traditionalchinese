import type {
  AnalysisResult,
  AuthorChatTurn,
  ComparativeAnalysisResult,
  GenerationType,
  HistoricalContextResult,
  ImageAsset,
  ImagePrompt,
  PassageFetchResult,
  SpacetimeSuggestionResult,
} from '../types';
import { countCharacters, splitSentences, toSimplifiedChinese } from './text';

const CHAT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const EMPTY_ANALYSIS: AnalysisResult = { sentences: [] };
const EMPTY_HISTORY: HistoricalContextResult = { overview: '', recentEvents: [] };
const EMPTY_COMPARATIVE: ComparativeAnalysisResult = {
  executiveSnapshot: '',
  timelineAnchors: [],
  comparatorShortlist: [],
  comparisonMatrix: [],
};
const EMPTY_SPACETIME: SpacetimeSuggestionResult = {
  subjectType: '',
  focalName: '',
  focalYears: '',
  focalCivilization: '',
  focalWork: '',
  workDate: '',
  timeWindow: '',
  civilizations: '',
  maxPerRegion: '',
  audience: '',
  length: '',
};

const MAX_PASSAGE_SNIPPET = 800;

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
    role: 'system' | 'user' | 'assistant';
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

const toNormalizedString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
};

const toNormalizedStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => toNormalizedString(item))
    .filter((item): item is string => item.length > 0);
};

const normalizeComparativeAnalysis = (
  payload: ComparativeAnalysisResult | undefined,
): ComparativeAnalysisResult => {
  if (!payload) {
    return EMPTY_COMPARATIVE;
  }

  const timelineAnchors = Array.isArray(payload.timelineAnchors)
    ? payload.timelineAnchors
        .map((entry) => ({
          year: toNormalizedString((entry as { year?: unknown }).year),
          detail: toNormalizedString((entry as { detail?: unknown }).detail),
        }))
        .filter((entry) => entry.year.length > 0 || entry.detail.length > 0)
    : [];

  const comparatorShortlist = Array.isArray(payload.comparatorShortlist)
    ? payload.comparatorShortlist
        .map((region) => {
          const regionName = toNormalizedString((region as { region?: unknown }).region);
          const figuresRaw = Array.isArray((region as { figures?: unknown }).figures)
            ? ((region as { figures: unknown[] }).figures)
            : [];
          const figures = figuresRaw
            .map((figure) => {
              const name = toNormalizedString((figure as { name?: unknown }).name);
              const hallmarkWorks = toNormalizedStringArray((figure as { hallmarkWorks?: unknown }).hallmarkWorks);
              const rationale = toNormalizedString((figure as { rationale?: unknown }).rationale);
              if (!name && hallmarkWorks.length === 0 && !rationale) {
                return null;
              }
              return {
                name: name || '未注明人物',
                hallmarkWorks,
                rationale,
              };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

          if (!regionName && figures.length === 0) {
            return null;
          }

          return {
            region: regionName || '未注明地区',
            figures,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  const comparisonMatrix = Array.isArray(payload.comparisonMatrix)
    ? payload.comparisonMatrix
        .map((row) => {
          const figure = toNormalizedString((row as { figure?: unknown }).figure);
          const region = toNormalizedString((row as { region?: unknown }).region);
          const keyWorks = toNormalizedString((row as { keyWorks?: unknown }).keyWorks);
          const formGenre = toNormalizedString((row as { formGenre?: unknown }).formGenre);
          const styleTechnique = toNormalizedString((row as { styleTechnique?: unknown }).styleTechnique);
          const themes = toNormalizedString((row as { themes?: unknown }).themes);
          const context = toNormalizedString((row as { context?: unknown }).context);
          const influence = toNormalizedString((row as { influence?: unknown }).influence);

          if (
            !figure &&
            !region &&
            !keyWorks &&
            !formGenre &&
            !styleTechnique &&
            !themes &&
            !context &&
            !influence
          ) {
            return null;
          }

          return {
            figure: figure || '未注明人物',
            region: region || '未注明地区',
            keyWorks,
            formGenre,
            styleTechnique,
            themes,
            context,
            influence,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  const executiveSnapshot = toNormalizedString(payload.executiveSnapshot);

  return {
    executiveSnapshot,
    timelineAnchors,
    comparatorShortlist,
    comparisonMatrix,
  };
};

const normalizeSpacetimeSuggestion = (
  payload: SpacetimeSuggestionResult | undefined,
): SpacetimeSuggestionResult => {
  if (!payload) {
    return EMPTY_SPACETIME;
  }

  return {
    subjectType: toNormalizedString((payload as { subjectType?: unknown }).subjectType),
    focalName: toNormalizedString((payload as { focalName?: unknown }).focalName),
    focalYears: toNormalizedString((payload as { focalYears?: unknown }).focalYears),
    focalCivilization: toNormalizedString((payload as { focalCivilization?: unknown }).focalCivilization),
    focalWork: toNormalizedString((payload as { focalWork?: unknown }).focalWork),
    workDate: toNormalizedString((payload as { workDate?: unknown }).workDate),
    timeWindow: toNormalizedString((payload as { timeWindow?: unknown }).timeWindow),
    civilizations: toNormalizedString((payload as { civilizations?: unknown }).civilizations),
    maxPerRegion: toNormalizedString((payload as { maxPerRegion?: unknown }).maxPerRegion),
    audience: toNormalizedString((payload as { audience?: unknown }).audience),
    length: toNormalizedString((payload as { length?: unknown }).length),
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
  //if (!baseImage.token) {
  //  throw new Error('当前图像不支持继续编辑。');
  //}

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

export const generateSpacetimeSuggestions = async (
  apiKey: string,
  author: string,
  workTitle: string,
  passage: string,
): Promise<SpacetimeSuggestionResult> => {
  const trimmedAuthor = author.trim();
  const trimmedWork = workTitle.trim();

  const systemPrompt =
    '你是一位跨文明文学史课程设计顾问。始终以 JSON 回复 {"subjectType":"","focalName":"","focalYears":"","focalCivilization":"","focalWork":"","workDate":"","timeWindow":"","civilizations":"","maxPerRegion":"","audience":"","length":""}。所有字段使用简体中文，若无适当建议请留空字符串。';

  const contextLines = [
    `作者：${trimmedAuthor || '未知'}`,
    `作品：${trimmedWork || '未提供'}`,
    `教学选段：${passage.trim()}`,
    '任务：推测构建跨文明比较分析所需的关键参数，确保时间窗口与文明范围合理，并给出适合课堂教学的受众语气与篇幅建议。',
  ];

  const rawResult = await requestChatCompletion<SpacetimeSuggestionResult>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextLines.join('\n') },
      ],
      temperature: 0.35,
      top_p: 0.75,
      max_output_tokens: 1024,
    },
    apiKey,
    'spacetime-hints',
    EMPTY_SPACETIME,
  );

  const suggestions = normalizeSpacetimeSuggestion(rawResult);
  const hasContent = Object.values(suggestions).some((value) => value.length > 0);

  if (!hasContent) {
    throw new Error('模型未返回有效的构建参数，请稍后再试。');
  }

  return suggestions;
};

export const fetchPassageText = async (
  apiKey: string,
  author: string,
  workTitle: string,
): Promise<string> => {
  const trimmedAuthor = author.trim();
  const trimmedWork = workTitle.trim();

  if (!trimmedAuthor || !trimmedWork) {
    throw new Error('请提供作者与作品名称后再尝试填充正文。');
  }

  const systemPrompt =
    '你是一位严谨的古典文学资料整理者。仅以 JSON 回复 {"passage":""}，其中 passage 必须是所查询作品的原文正文，不得包含标点外的说明、注释或额外文字。不得添加标题、译文、注解或任何额外内容。';

  const userPrompt = `作者：${trimmedAuthor}\n作品：${trimmedWork}\n任务：请提供该作品的全文原文，仅保留正文内容。若该作品不存在，请回复空字符串。`;

  const result = await requestChatCompletion<PassageFetchResult>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      top_p: 0.6,
      max_output_tokens: 2048,
    },
    apiKey,
    'passage-fill',
    { passage: '' },
  );

  const passage = typeof result.passage === 'string' ? result.passage.trim() : '';

  if (!passage) {
    throw new Error('未能找到该作品的正文，请确认作者与作品名称后再试。');
  }

  return passage;
};

const buildAuthorPersonaPrompt = (
  author: string,
  workTitle: string,
  passage: string,
): string => {
  const displayAuthor = author.trim() || '这位作者';
  const trimmedWork = workTitle.trim();
  const trimmedPassage = passage.trim();
  const snippet = trimmedPassage.slice(0, MAX_PASSAGE_SNIPPET);
  const hasMore = snippet.length < trimmedPassage.length;

  const lines: string[] = [
    `你将扮演${displayAuthor}，与学生围绕文学创作、思想、人生际遇开展对话。`,
    '回应需结合你的一生经历、时代背景与作品主旨，辩证地讨论学生的观点。',
    '请频繁引用你自己的诗文、尺牍或同代记载中的原句（可保留原文文言或繁体），并在需要时给予简短说明。',
    '若学生的观点值得辩驳，请明确提出反驳并陈述理由。',
    '整体使用简体中文表达，语气应符合作者身份的文雅与锋利。',
    '严禁讨论与你及你作品、思想、时代无关的主题；若学生偏离，请郑重致歉并拒答，将话题引回相关领域。',
    '单次回答建议 80-180 字，可适度分段。',
  ];

  if (trimmedWork) {
    lines.push(`代表作品提示：包括《${trimmedWork}》等。`);
  }

  if (snippet) {
    lines.push(`课堂研读片段参考：${snippet}${hasMore ? '…（内容已截断）' : ''}`);
  }

  return lines.join('\n');
};

export const continueAuthorChat = async (
  apiKey: string,
  author: string,
  workTitle: string,
  passage: string,
  turns: AuthorChatTurn[],
): Promise<string> => {
  const personaPrompt = buildAuthorPersonaPrompt(author, workTitle, passage);

  const sanitizedTurns = turns
    .map((turn) => ({ ...turn, content: turn.content.trim() }))
    .filter((turn) => turn.content.length > 0);

  if (sanitizedTurns.length === 0) {
    throw new Error('请先提出想要讨论的问题。');
  }

  const payload: ChatCompletionPayload = {
    model: 'google/gemini-2.5-pro',
    messages: [
      { role: 'system', content: personaPrompt },
      ...sanitizedTurns.map((turn) => ({ role: turn.role, content: turn.content })),
    ],
    temperature: 0.55,
    top_p: 0.8,
    max_output_tokens: 1024,
  };

  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: createHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter author-chat 请求失败：${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const reply = extractTextContent(data.choices?.[0]?.message?.content)?.trim();

  if (!reply) {
    throw new Error('作者暂时没有回应，请稍后再试。');
  }

  return reply;
};

export interface ComparativeAnalysisParams {
  subjectType: string;
  focalName: string;
  focalYears: string;
  focalCivilization: string;
  focalWork?: string;
  workDate?: string;
  timeWindow: string;
  civilizations: string;
  maxPerRegion: string;
  audience: string;
  length: string;
}

export const generateComparativeAnalysis = async (
  apiKey: string,
  author: string,
  workTitle: string,
  passage: string,
  params: ComparativeAnalysisParams,
): Promise<ComparativeAnalysisResult> => {
  const {
    subjectType,
    focalName,
    focalYears,
    focalCivilization,
    focalWork,
    workDate,
    timeWindow,
    civilizations,
    maxPerRegion,
    audience,
    length,
  } = params;

  const systemPrompt =
    '你是一位严谨的跨文明人文研究者与课程设计者。始终以 JSON 回复，结构必须为 {"executiveSnapshot":"","timelineAnchors":[{"year":"","detail":""}],"comparatorShortlist":[{"region":"","figures":[{"name":"","hallmarkWorks":[""],"rationale":""}]}],"comparisonMatrix":[{"figure":"","region":"","keyWorks":"","formGenre":"","styleTechnique":"","themes":"","context":"","influence":""}] }。所有字段内容均使用简体中文表达，不得包含 Markdown、HTML 或额外字段。若某项信息缺失，用空字符串表示。请在文本中保留必要的方括号引用。';

  const preamble = `作者：${author || '未知'}\n作品：${workTitle || '未提供'}\n全文：${passage}\n`;

  const template = `角色：你是一位细致的跨文明人文研究者与课程设计者，请提供有据可查的比较结论。\n\n任务：围绕一个核心人物（及其代表作，如有）构建跨文明比较，聚焦±${timeWindow || '50'}年的同代或近代人物，比较风格/理念、体裁形式、思想主题、历史语境与影响力。\n\n输入信息：\n- 人物类型：${subjectType}\n- 核心人物：${focalName}（生卒：${focalYears}，文明：${focalCivilization}）\n- 核心作品：${focalWork || '未提供'}（年代：${workDate || '未提供'}）\n- 时间窗口：${timeWindow} 年\n- 需扫描的文明：${civilizations}\n- 每地区比较对象上限：${maxPerRegion}\n- 目标受众与语气：${audience}\n- 目标篇幅：${length}\n\n输出要求：仅填写 executiveSnapshot、timelineAnchors、comparatorShortlist、comparisonMatrix 四个板块内容；每个字段必须以简体中文描述，并在适当处加注可核查的来源（方括号）。若需扩张时间窗口，请在相关条目中注明。`;

  const rawResult = await requestChatCompletion<ComparativeAnalysisResult>(
    {
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: preamble + template },
      ],
      temperature: 0.3,
      top_p: 0.75,
      max_output_tokens: 3584,
    },
    apiKey,
    'comparative-analysis',
    EMPTY_COMPARATIVE,
  );

  const normalized = normalizeComparativeAnalysis(rawResult);

  if (
    !normalized.executiveSnapshot &&
    normalized.timelineAnchors.length === 0 &&
    normalized.comparisonMatrix.length === 0
  ) {
    throw new Error('模型未返回有效的构建时空分析，请稍后再试。');
  }

  return normalized;
};
