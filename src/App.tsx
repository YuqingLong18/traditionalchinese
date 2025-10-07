import { Fragment, useEffect, useRef, useState } from 'react';
import './App.css';
import type {
  AnalysisResult,
  AuthorChatMessage,
  AuthorChatTurn,
  ComparativeAnalysisResult,
  HistoricalContextResult,
  ImageAsset,
} from './types';
import {
  editIllustration,
  fetchPassageText,
  generateAnalysis,
  generateComparativeAnalysis,
  generateHistoricalContext,
  generateIllustrations,
  generateSpacetimeSuggestions,
  continueAuthorChat,
  ModelJsonError,
} from './utils/api';
import {
  downloadHtml,
  downloadImagesAsZip,
  downloadSingleImage,
} from './utils/download';

const formatMessage = (template: string, params: Record<string, string | number>): string =>
  Object.entries(params).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template,
  );

const translations = {
  zh: {
    header: {
      title: '传统文学教学助手',
      subtitle: '面向课堂教学的文言文翻译、解析与图像生成工具',
      toggleLabel: 'English',
    },
    status: {
      template: '状态：{status}',
      ready: 'OK',
      notReady: '服务未就绪',
    },
    inputs: {
      authorLabel: '作者姓名',
      authorPlaceholder: '示例：莎士比亚',
      workLabel: '作品名称',
      workPlaceholder: '示例：第十八首十四行诗',
      passageLabel: '文言原文',
      passagePlaceholder: '请粘贴需要教学的古典诗文，系统将生成现代汉语翻译、解析与情境插图。',
      characterCount: '字数：{count}',
    },
    buttons: {
      fillText: '填充正文',
      fillTextLoading: '填充中…',
      analysis: '翻译与逐句解析',
      analysisLoading: '生成中…',
      history: '历史背景分析',
      historyLoading: '分析中…',
      scenes: '作品场景插图',
      scenesLoading: '绘制中…',
      editLoading: '编辑中…',
      spacetime: '构建时空',
      spacetimeLoading: '构建中…',
      chat: '与作者对话',
      chatActive: '作者对话（进行中）',
      chatLoading: '等待作者…',
      send: '发送',
      sendLoading: '作者思索中…',
      downloadHtml: '下载 HTML',
      downloadImage: '下载此图',
      downloadAllImages: '下载全部插图（ZIP）',
      submitEdit: '提交修改',
      revertImage: '退回修改',
      spacetimeAutofill: '帮我构建',
      spacetimeAutofillLoading: '生成建议中…',
    },
    spacetime: {
      title: '构建时空参数',
      fields: {
        subjectType: '人物类型',
        focalName: '核心人物',
        focalYears: '生卒年份',
        focalCivilization: '文明体系',
        focalWork: '核心作品',
        workDate: '作品年代',
        timeWindow: '时间窗口（年）',
        civilizations: '跨文化范围',
        maxPerRegion: '每区人数上限',
        audience: '受众与语气',
        length: '目标篇幅',
      },
      placeholders: {
        focalName: '示例：莎士比亚',
        focalYears: '示例：1564–1616',
        focalCivilization: '示例：伊丽莎白时期英格兰',
        focalWork: '示例：哈姆雷特',
        workDate: '示例：1609',
      },
    },
    chat: {
      title: '与作者对话',
      placeholder: '提出你想向 {author} 询问的观点或疑惑，例如：为何在《{work}》中选择此种表达？',
      placeholderAuthorFallback: '作者',
      placeholderWorkFallback: '这部作品',
      youLabel: '你',
    },
    results: {
      analysis: {
        title: '逐句翻译与解析',
        headers: {
          original: '原文',
          simplified: '现代汉语翻译',
          explanation: '关键词与解析',
        },
      },
      history: {
        title: '历史背景分析',
        overview: '作者整体概览',
        events: '成稿前 1-3 年关键事件',
      },
      scenes: {
        title: '作品场景插图',
        note: '系统根据文段自动确定图像数量，共 {count} 张。',
        promptLabel: '提示词：',
        revertHint: '可恢复到修改前的版本',
        editPlaceholder: '输入修改提示，例如：加入高山云海，增强远景层次。',
      },
      comparative: {
        title: '构建时空比较分析',
        overview: '总览',
        timeline: '时间锚点（±{years} 年）',
        shortlist: '对比名单',
        matrix: '比较矩阵',
        tableHeaders: {
          timelineYear: '年份',
          timelineDetail: '事件 / 人物 / 作品（地区）',
          figure: '人物（地区）',
          works: '代表作品',
          form: '体裁',
          style: '风格技法',
          themes: '主题',
          context: '历史语境',
          influence: '影响 / 传播',
        },
        worksLabel: '作品：',
        rationaleLabel: '理由：',
        detailSeparator: '；',
        unknownWork: '未注明作品',
        unknownReason: '未提供理由',
      },
    },
    errors: {
      missingApiKey: '未检测到环境变量 VITE_OPENROUTER_API_KEY，请先完成配置。',
      missingPassage: '请输入需要解析的文言文内容。',
      missingAuthorWork: '请先填写作者与作品名称。',
      missingSpacetimeCore: '请完善核心人物信息（姓名、生卒年份、文明）。',
      missingSpacetimeInput: '请至少填写作者或作品名称，以便进行构建建议。',
      missingChatAuthor: '请先填写作者姓名，才能与作者对话。',
      missingEditPrompt: '请输入具体的修改提示。',
      passageFillFailed: '未能自动填充正文，请稍后再试。',
      spacetimeBuildFailed: '构建时空分析失败，请稍后再试。',
      analysisFailed: '生成过程中出现未知错误。',
      historyFailed: '生成过程中出现未知错误。',
      sceneGenerationFailed: '图像生成失败，请稍后再试。',
      spacetimeSuggestionFailed: '未能获取构建建议，请稍后再试。',
      chatFailed: '对话请求失败，请稍后再试。',
      imageEditFailed: '图像编辑失败，请稍后再试。',
    },
    footer:
      '生成图像可能产生额外的 API 费用，请在课堂前完成额度确认。若调用失败，请稍后重试或缩短输入文本。',
  },
  en: {
    header: {
      title: 'Classical Literature Teaching Assistant',
      subtitle: 'Generate lesson-ready translation, analysis, and visuals for classical texts.',
      toggleLabel: '中文',
    },
    status: {
      template: 'Status: {status}',
      ready: 'Ready',
      notReady: 'API key missing',
    },
    inputs: {
      authorLabel: 'Author Name',
      authorPlaceholder: 'Example: William Shakespeare',
      workLabel: 'Work Title',
      workPlaceholder: 'Example: Sonnet 18',
      passageLabel: 'Classical Passage',
      passagePlaceholder:
        'Paste the passage you plan to teach. The system will produce modern Chinese translation, analysis, and scene imagery.',
      characterCount: 'Characters: {count}',
    },
    buttons: {
      fillText: 'Fetch Passage',
      fillTextLoading: 'Fetching…',
      analysis: 'Translation & Sentence Analysis',
      analysisLoading: 'Generating…',
      history: 'Historical Context',
      historyLoading: 'Analyzing…',
      scenes: 'Scene Illustrations',
      scenesLoading: 'Rendering…',
      editLoading: 'Updating…',
      spacetime: 'Comparative Spacetime',
      spacetimeLoading: 'Building…',
      chat: 'Talk with the Author',
      chatActive: 'Author Chat (Active)',
      chatLoading: 'Waiting for author…',
      send: 'Send',
      sendLoading: 'Author is thinking…',
      downloadHtml: 'Download HTML',
      downloadImage: 'Download image',
      downloadAllImages: 'Download all images (ZIP)',
      submitEdit: 'Apply edit',
      revertImage: 'Revert changes',
      spacetimeAutofill: 'Suggest parameters',
      spacetimeAutofillLoading: 'Suggesting…',
    },
    spacetime: {
      title: 'Comparative Spacetime Parameters',
      fields: {
        subjectType: 'Subject type',
        focalName: 'Focal figure',
        focalYears: 'Lifespan',
        focalCivilization: 'Civilization',
        focalWork: 'Key work',
        workDate: 'Composition date',
        timeWindow: 'Time window (years)',
        civilizations: 'Civilizations to scan',
        maxPerRegion: 'Max figures per region',
        audience: 'Audience & tone',
        length: 'Target length',
      },
      placeholders: {
        focalName: 'Example: William Shakespeare',
        focalYears: 'Example: 1564–1616',
        focalCivilization: 'Example: Elizabethan England',
        focalWork: 'Example: Hamlet',
        workDate: 'Example: 1609',
      },
    },
    chat: {
      title: 'Talk with the Author',
      placeholder: 'Share a question or perspective for {author}, e.g., what inspired the imagery in {work}?',
      placeholderAuthorFallback: 'the author',
      placeholderWorkFallback: 'this work',
      youLabel: 'You',
    },
    results: {
      analysis: {
        title: 'Translation & Sentence Analysis',
        headers: {
          original: 'Original text',
          simplified: 'Modern Chinese translation',
          explanation: 'Keywords & notes',
        },
      },
      history: {
        title: 'Historical Context Analysis',
        overview: 'Author overview',
        events: 'Key developments 1–3 years before publication',
      },
      scenes: {
        title: 'Scene Illustrations',
        note: 'The system generated {count} images based on the passage.',
        promptLabel: 'Prompt: ',
        revertHint: 'Restore the previous version any time.',
        editPlaceholder: 'Describe the edit, e.g., add distant mountains and mist.',
      },
      comparative: {
        title: 'Comparative Spacetime Analysis',
        overview: 'Executive snapshot',
        timeline: 'Timeline anchors (±{years} years)',
        shortlist: 'Comparison shortlist',
        matrix: 'Comparison matrix',
        tableHeaders: {
          timelineYear: 'Year',
          timelineDetail: 'Event / Figure / Work (Region)',
          figure: 'Figure (Region)',
          works: 'Key works',
          form: 'Form / Genre',
          style: 'Style & technique',
          themes: 'Themes',
          context: 'Historical context',
          influence: 'Influence / reach',
        },
        worksLabel: 'Works: ',
        rationaleLabel: 'Reason: ',
        detailSeparator: ' · ',
        unknownWork: 'Not specified',
        unknownReason: 'No rationale provided',
      },
    },
    errors: {
      missingApiKey: 'OpenRouter API key not found. Please set VITE_OPENROUTER_API_KEY.',
      missingPassage: 'Please paste the passage you want to analyse.',
      missingAuthorWork: 'Enter both author and work title first.',
      missingSpacetimeCore: 'Please complete the focal figure name, lifespan, and civilization.',
      missingSpacetimeInput: 'Provide at least the author or work title to suggest parameters.',
      missingChatAuthor: 'Enter the author name before starting the conversation.',
      missingEditPrompt: 'Please provide a concrete edit prompt.',
      passageFillFailed: 'Unable to fetch the passage. Try again later.',
      spacetimeBuildFailed: 'Comparative spacetime build failed. Please retry.',
      analysisFailed: 'Generation failed. Please try again later.',
      historyFailed: 'Generation failed. Please try again later.',
      sceneGenerationFailed: 'Image generation failed. Please try again later.',
      spacetimeSuggestionFailed: 'No suggestions returned. Please retry later.',
      chatFailed: 'Chat request failed. Please try again.',
      imageEditFailed: 'Image editing failed. Please retry.',
    },
    footer:
      'Image generation may incur extra API usage. Confirm quota before class and retry with shorter text if needed.',
  },
} as const;

type Translations = typeof translations;
type Locale = keyof Translations;
type ErrorMessageKey = keyof Translations[keyof Translations]['errors'];

const API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY ?? '').trim();

type LoadingState = {
  analysis: boolean;
  history: boolean;
  'scene-images': boolean;
  'passage-fill': boolean;
  spacetime: boolean;
  'author-chat': boolean;
  'spacetime-fill': boolean;
};

type ErrorEntry =
  | { type: 'code'; code: ErrorMessageKey }
  | { type: 'custom'; message: string };

type ErrorState = Partial<Record<keyof LoadingState, ErrorEntry>>;

type EditLoadingState = Record<string, boolean>;
type EditValueState = Record<string, string>;
type PreviousImageState = Record<string, ImageAsset>;

const initialLoading: LoadingState = {
  analysis: false,
  history: false,
  'scene-images': false,
  'passage-fill': false,
  spacetime: false,
  'author-chat': false,
  'spacetime-fill': false,
};

const initialErrors: ErrorState = {};

const App = () => {
  const [locale, setLocale] = useState<Locale>('zh');
  const [author, setAuthor] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [historyResult, setHistoryResult] = useState<HistoricalContextResult | null>(null);
  const [sceneImages, setSceneImages] = useState<ImageAsset[]>([]);
  const [comparativeResult, setComparativeResult] = useState<ComparativeAnalysisResult | null>(null);
  const [loading, setLoading] = useState<LoadingState>(initialLoading);
  const [errors, setErrors] = useState<ErrorState>(initialErrors);
  const [editLoading, setEditLoading] = useState<EditLoadingState>({});
  const [editValues, setEditValues] = useState<EditValueState>({});
  const [previousImages, setPreviousImages] = useState<PreviousImageState>({});
  const [isAuthorChatOpen, setIsAuthorChatOpen] = useState(false);
  const [authorChatMessages, setAuthorChatMessages] = useState<AuthorChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [showSpacetimeParams, setShowSpacetimeParams] = useState(false);

  const [subjectType, setSubjectType] = useState('poet');
  const [focalName, setFocalName] = useState('');
  const [focalYears, setFocalYears] = useState('');
  const [focalCivilization, setFocalCivilization] = useState('');
  const [focalWork, setFocalWork] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [timeWindow, setTimeWindow] = useState('50');
  const [civilizations, setCivilizations] = useState('日本，韩国，伊斯兰世界，欧洲');
  const [maxPerRegion, setMaxPerRegion] = useState('2');
  const [audience, setAudience] = useState('high-school advanced humanities');
  const [length, setLength] = useState('~900 words');

  const analysisRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const t = translations[locale];

  const passageCharacterCount = passage.replace(/\s+/g, '').length;

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [authorChatMessages]);

  const resetErrorsFor = (key: keyof LoadingState) => {
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const setErrorCode = (key: keyof LoadingState, code: ErrorMessageKey) => {
    setErrors((prev) => ({ ...prev, [key]: { type: 'code', code } }));
  };

  const setCustomError = (key: keyof LoadingState, message: string) => {
    setErrors((prev) => ({ ...prev, [key]: { type: 'custom', message } }));
  };

  const setLoadingFor = (key: keyof LoadingState, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  };

  const guardInputs = (requiredKey: keyof LoadingState): boolean => {
    if (!API_KEY) {
      setErrorCode(requiredKey, 'missingApiKey');
      return false;
    }
    if (!passage.trim()) {
      setErrorCode(requiredKey, 'missingPassage');
      return false;
    }
    return true;
  };

  const handleFillPassage = async () => {
    if (!API_KEY) {
      setErrorCode('passage-fill', 'missingApiKey');
      return;
    }

    if (!author.trim() || !workTitle.trim()) {
      setErrorCode('passage-fill', 'missingAuthorWork');
      return;
    }

    resetErrorsFor('passage-fill');
    setLoadingFor('passage-fill', true);

    try {
      const text = await fetchPassageText(API_KEY, author, workTitle);
      setPassage(text);
    } catch (error) {
      if (error instanceof ModelJsonError) {
        console.error('模型返回内容：', error.rawContent);
      }
      if (error instanceof Error) {
        setCustomError('passage-fill', error.message);
      } else {
        setErrorCode('passage-fill', 'passageFillFailed');
      }
    } finally {
      setLoadingFor('passage-fill', false);
    }
  };

  const handleSpacetimeAnalysis = async () => {
    if (!showSpacetimeParams) {
      setShowSpacetimeParams(true);
      return;
    }

    if (!guardInputs('spacetime')) {
      return;
    }

    if (!focalName.trim() || !focalYears.trim() || !focalCivilization.trim()) {
      setErrorCode('spacetime', 'missingSpacetimeCore');
      return;
    }

    resetErrorsFor('spacetime');
    setLoadingFor('spacetime', true);

    try {
      const result = await generateComparativeAnalysis(API_KEY, author.trim(), workTitle.trim(), passage.trim(), {
        subjectType: subjectType.trim(),
        focalName: focalName.trim(),
        focalYears: focalYears.trim(),
        focalCivilization: focalCivilization.trim(),
        focalWork: focalWork.trim(),
        workDate: workDate.trim(),
        timeWindow: timeWindow.trim() || '50',
        civilizations: civilizations.trim(),
        maxPerRegion: maxPerRegion.trim() || '2',
        audience: audience.trim(),
        length: length.trim(),
      });
      setComparativeResult(result);
    } catch (error) {
      if (error instanceof ModelJsonError) {
        console.error('模型返回内容：', error.rawContent);
      }
      if (error instanceof Error) {
        setCustomError('spacetime', error.message);
      } else {
        setErrorCode('spacetime', 'spacetimeBuildFailed');
      }
    } finally {
      setLoadingFor('spacetime', false);
    }
  };

  const handleAnalysis = async () => {
    if (!guardInputs('analysis')) {
      return;
    }

    resetErrorsFor('analysis');
    setLoadingFor('analysis', true);

    try {
      const result = await generateAnalysis(API_KEY, author.trim(), passage.trim());
      setAnalysisResult(result);
    } catch (error) {
      if (error instanceof ModelJsonError) {
        console.error('模型返回内容：', error.rawContent);
      }
      if (error instanceof Error) {
        setCustomError('analysis', error.message);
      } else {
        setErrorCode('analysis', 'analysisFailed');
      }
    } finally {
      setLoadingFor('analysis', false);
    }
  };

  const handleHistory = async () => {
    if (!guardInputs('history')) {
      return;
    }

    resetErrorsFor('history');
    setLoadingFor('history', true);

    try {
      const result = await generateHistoricalContext(API_KEY, author.trim(), passage.trim());
      setHistoryResult(result);
    } catch (error) {
      if (error instanceof ModelJsonError) {
        console.error('模型返回内容：', error.rawContent);
      }
      if (error instanceof Error) {
        setCustomError('history', error.message);
      } else {
        setErrorCode('history', 'historyFailed');
      }
    } finally {
      setLoadingFor('history', false);
    }
  };

  const handleSceneIllustrations = async () => {
    if (!guardInputs('scene-images')) {
      return;
    }

    resetErrorsFor('scene-images');
    setLoadingFor('scene-images', true);

    try {
      const images = await generateIllustrations(
        API_KEY,
        author.trim(),
        passage.trim(),
        'scene-images',
      );
      setSceneImages(images);
    } catch (error) {
      if (error instanceof Error) {
        setCustomError('scene-images', error.message);
      } else {
        setErrorCode('scene-images', 'sceneGenerationFailed');
      }
    } finally {
      setLoadingFor('scene-images', false);
    }
  };

  const handleSpacetimeAutofill = async () => {
    if (!showSpacetimeParams) {
      setShowSpacetimeParams(true);
    }

    if (!author.trim() && !workTitle.trim()) {
      setErrorCode('spacetime-fill', 'missingSpacetimeInput');
      return;
    }

    if (!guardInputs('spacetime-fill')) {
      return;
    }

    resetErrorsFor('spacetime-fill');
    setLoadingFor('spacetime-fill', true);

    try {
      const suggestions = await generateSpacetimeSuggestions(API_KEY, author, workTitle, passage);

      if (suggestions.subjectType) {
        setSubjectType(suggestions.subjectType);
      }
      if (suggestions.focalName) {
        setFocalName(suggestions.focalName);
      }
      if (suggestions.focalYears) {
        setFocalYears(suggestions.focalYears);
      }
      if (suggestions.focalCivilization) {
        setFocalCivilization(suggestions.focalCivilization);
      }
      if (suggestions.focalWork) {
        setFocalWork(suggestions.focalWork);
      }
      if (suggestions.workDate) {
        setWorkDate(suggestions.workDate);
      }
      if (suggestions.timeWindow) {
        setTimeWindow(suggestions.timeWindow);
      }
      if (suggestions.civilizations) {
        setCivilizations(suggestions.civilizations);
      }
      if (suggestions.maxPerRegion) {
        setMaxPerRegion(suggestions.maxPerRegion);
      }
      if (suggestions.audience) {
        setAudience(suggestions.audience);
      }
      if (suggestions.length) {
        setLength(suggestions.length);
      }
    } catch (error) {
      if (error instanceof Error) {
        setCustomError('spacetime-fill', error.message);
      } else {
        setErrorCode('spacetime-fill', 'spacetimeSuggestionFailed');
      }
    } finally {
      setLoadingFor('spacetime-fill', false);
    }
  };

  const handleOpenAuthorChat = () => {
    if (isAuthorChatOpen) {
      return;
    }

    if (!author.trim()) {
      setErrorCode('author-chat', 'missingChatAuthor');
      return;
    }

    if (!guardInputs('author-chat')) {
      return;
    }

    resetErrorsFor('author-chat');
    setIsAuthorChatOpen(true);
  };

  const handleSendAuthorChat = async () => {
    const trimmedMessage = chatDraft.trim();
    if (!trimmedMessage) {
      return;
    }

    if (!author.trim()) {
      setErrorCode('author-chat', 'missingChatAuthor');
      return;
    }

    if (!guardInputs('author-chat')) {
      return;
    }

    resetErrorsFor('author-chat');

    const timestamp = Date.now();
    const userMessage: AuthorChatMessage = {
      id: `user-${timestamp}`,
      role: 'user',
      content: trimmedMessage,
      timestamp,
    };

    const nextHistory = [...authorChatMessages, userMessage];
    setAuthorChatMessages(nextHistory);
    setChatDraft('');
    setLoadingFor('author-chat', true);

    const historyForApi = nextHistory.map<AuthorChatTurn>((message) => ({
      role: message.role === 'author' ? 'assistant' : 'user',
      content: message.content,
    }));

    try {
      const reply = await continueAuthorChat(
        API_KEY,
        author,
        workTitle,
        passage,
        historyForApi,
        locale,
        trimmedMessage,
      );

      const responseTimestamp = Date.now();
      const responseMessage: AuthorChatMessage = {
        id: `author-${responseTimestamp}`,
        role: 'author',
        content: reply,
        timestamp: responseTimestamp,
      };

      setAuthorChatMessages((prev) => [...prev, responseMessage]);
    } catch (error) {
      if (error instanceof Error) {
        setCustomError('author-chat', error.message);
      } else {
        setErrorCode('author-chat', 'chatFailed');
      }
    } finally {
      setLoadingFor('author-chat', false);
    }
  };

  const handleEditPromptChange = (imageId: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [imageId]: value }));
  };

  const handleEditImage = async (image: ImageAsset) => {
    const editPrompt = (editValues[image.id] || '').trim();
    if (!editPrompt) {
      setErrorCode('scene-images', 'missingEditPrompt');
      return;
    }

    setEditLoading((prev) => ({ ...prev, [image.id]: true }));
    resetErrorsFor('scene-images');

    try {
      setPreviousImages((prev) => ({ ...prev, [image.id]: image }));

      const updated = await editIllustration(API_KEY, image, editPrompt, 'scene-images');
      setSceneImages((prev) => prev.map((item) => (item.id === image.id ? updated : item)));
      setEditValues((prev) => ({ ...prev, [image.id]: '' }));
    } catch (error) {
      if (error instanceof Error) {
        setCustomError('scene-images', error.message);
      } else {
        setErrorCode('scene-images', 'imageEditFailed');
      }
    } finally {
      setEditLoading((prev) => ({ ...prev, [image.id]: false }));
    }
  };

  const handleRevertImage = (imageId: string) => {
    const previousImage = previousImages[imageId];
    if (!previousImage) {
      return;
    }

    setSceneImages((prev) => prev.map((item) => (item.id === imageId ? previousImage : item)));

    setPreviousImages((prev) => {
      const updated = { ...prev };
      delete updated[imageId];
      return updated;
    });

    setEditValues((prev) => ({ ...prev, [imageId]: '' }));
  };

  const renderAnalysisResult = () => {
    if (!analysisResult) {
      return null;
    }

    const analysisStrings = t.results.analysis;

    return (
      <div className="result-card" ref={analysisRef}>
        <h3>{analysisStrings.title}</h3>
        <div className="sentence-grid">
          <div className="sentence-header">{analysisStrings.headers.original}</div>
          <div className="sentence-header">{analysisStrings.headers.simplified}</div>
          <div className="sentence-header">{analysisStrings.headers.explanation}</div>
          {analysisResult.sentences.map((sentence, index) => (
            <Fragment key={`sentence-${index}`}>
              <div className="sentence-cell">
                <p>{sentence.original}</p>
              </div>
              <div className="sentence-cell">
                <p>{sentence.simplified}</p>
              </div>
              <div className="sentence-cell">
                <ul>
                  {sentence.explanation.map((item, idx) => (
                    <li key={`${index}-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  const escapeHtml = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }
    const text = typeof value === 'string' ? value : String(value);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const buildComparativeHtml = (result: ComparativeAnalysisResult): string => {
    const comparativeStrings = t.results.comparative;

    const timelineRows = result.timelineAnchors
      .map(
        (entry) =>
          `<tr><td>${escapeHtml(entry.year)}</td><td>${escapeHtml(entry.detail)}</td></tr>`,
      )
      .join('');

    const comparatorSections = result.comparatorShortlist
      .map((region) => {
        const items = region.figures
          .map((figure) => {
            const worksText =
              figure.hallmarkWorks.length > 0
                ? figure.hallmarkWorks.join('；')
                : comparativeStrings.unknownWork;
            const rationaleText = figure.rationale || comparativeStrings.unknownReason;
            const detail = `${comparativeStrings.worksLabel}${worksText}${comparativeStrings.detailSeparator}${comparativeStrings.rationaleLabel}${rationaleText}`;
            return `<li>${escapeHtml(figure.name)} — ${escapeHtml(detail)}</li>`;
          })
          .join('');
        return `<section><h4>${escapeHtml(region.region)}</h4><ul>${items}</ul></section>`;
      })
      .join('');

    const matrixRows = result.comparisonMatrix
      .map(
        (row) =>
          `<tr><td>${escapeHtml(`${row.figure}（${row.region}）`)}</td><td>${escapeHtml(row.keyWorks)}</td><td>${escapeHtml(row.formGenre)}</td><td>${escapeHtml(row.styleTechnique)}</td><td>${escapeHtml(row.themes)}</td><td>${escapeHtml(row.context)}</td><td>${escapeHtml(row.influence)}</td></tr>`,
      )
      .join('');

    const timelineHeading = formatMessage(comparativeStrings.timeline, { years: timeWindow });

    return `\n<section>\n  <h2>${escapeHtml(comparativeStrings.title)}</h2>\n  <h3>${escapeHtml(comparativeStrings.overview)}</h3>\n  <p>${escapeHtml(result.executiveSnapshot)}</p>\n  <h3>${escapeHtml(timelineHeading)}</h3>\n  <table border=\"1\" cellpadding=\"6\" cellspacing=\"0\">\n    <thead><tr><th>${escapeHtml(comparativeStrings.tableHeaders.timelineYear)}</th><th>${escapeHtml(comparativeStrings.tableHeaders.timelineDetail)}</th></tr></thead>\n    <tbody>${timelineRows}</tbody>\n  </table>\n  <h3>${escapeHtml(comparativeStrings.shortlist)}</h3>\n  ${comparatorSections}\n  <h3>${escapeHtml(comparativeStrings.matrix)}</h3>\n  <table border=\"1\" cellpadding=\"6\" cellspacing=\"0\">\n    <thead><tr><th>${escapeHtml(comparativeStrings.tableHeaders.figure)}</th><th>${escapeHtml(comparativeStrings.tableHeaders.works)}</th><th>${escapeHtml(comparativeStrings.tableHeaders.form)}</th><th>${escapeHtml(comparativeStrings.tableHeaders.style)}</th><th>${escapeHtml(comparativeStrings.tableHeaders.themes)}</th><th>${escapeHtml(comparativeStrings.tableHeaders.context)}</th><th>${escapeHtml(comparativeStrings.tableHeaders.influence)}</th></tr></thead>\n    <tbody>${matrixRows}</tbody>\n  </table>\n</section>`;
  };

  const analysisStrings = t.results.analysis;
  const historyStrings = t.results.history;
  const scenesStrings = t.results.scenes;
  const comparativeStrings = t.results.comparative;

  const analysisHtml = analysisResult
    ? `\n<section>\n  <h2>${escapeHtml(analysisStrings.title)}</h2>\n  <table border=\"1\" cellpadding=\"8\" cellspacing=\"0\">\n    <thead>\n      <tr>\n        <th>${escapeHtml(analysisStrings.headers.original)}</th>\n        <th>${escapeHtml(analysisStrings.headers.simplified)}</th>\n        <th>${escapeHtml(analysisStrings.headers.explanation)}</th>\n      </tr>\n    </thead>\n    <tbody>\n      ${analysisResult.sentences
        .map(
          (sentence) => `\n        <tr>\n          <td>${escapeHtml(sentence.original)}</td>\n          <td>${escapeHtml(sentence.simplified)}</td>\n          <td><ul>${sentence.explanation
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join('')}</ul></td>\n        </tr>`,
        )
        .join('')}\n    </tbody>\n  </table>\n</section>`
    : '';

  const historyHtml = historyResult
    ? `\n<section>\n  <h2>${escapeHtml(historyStrings.title)}</h2>\n  <p>${escapeHtml(historyResult.overview)}</p>\n  <h3>${escapeHtml(historyStrings.events)}</h3>\n  <ul>${historyResult.recentEvents
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>\n</section>`
    : '';

  const comparativeHtml = comparativeResult ? buildComparativeHtml(comparativeResult) : '';

  const disableActions = !passage.trim() || !API_KEY;

  const statusText = formatMessage(t.status.template, {
    status: API_KEY ? t.status.ready : t.status.notReady,
  });

  const chatPlaceholderAuthor = author || t.chat.placeholderAuthorFallback;
  const chatPlaceholderWork = workTitle || t.chat.placeholderWorkFallback;
  const chatPlaceholder = formatMessage(t.chat.placeholder, {
    author: chatPlaceholderAuthor,
    work: chatPlaceholderWork,
  });

  const handleToggleLocale = () => {
    setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'));
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>{t.header.title}</h1>
          <p>{t.header.subtitle}</p>
        </div>
        <div className="header-controls">
          <button type="button" className="language-toggle" onClick={handleToggleLocale}>
            {t.header.toggleLabel}
          </button>
          <div
            className={`status-chip ${API_KEY ? '' : 'warning'}`}
            role="status"
            aria-live="polite"
          >
            {statusText}
          </div>
        </div>
      </header>

      <main>
        <section className="input-panel">
          <div className="author-work-row">
            <div className="input-field">
              <label htmlFor="author">{t.inputs.authorLabel}</label>
              <input
                id="author"
                type="text"
                placeholder={t.inputs.authorPlaceholder}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
              />
            </div>

            <div className="input-field">
              <label htmlFor="work-title">{t.inputs.workLabel}</label>
              <input
                id="work-title"
                type="text"
                placeholder={t.inputs.workPlaceholder}
                value={workTitle}
                onChange={(event) => setWorkTitle(event.target.value)}
              />
            </div>

            <div className="fill-action">
              <button
                type="button"
                className="secondary"
                onClick={handleFillPassage}
                disabled={
                  !author.trim() ||
                  !workTitle.trim() ||
                  !API_KEY ||
                  loading['passage-fill']
                }
              >
                {loading['passage-fill'] ? t.buttons.fillTextLoading : t.buttons.fillText}
              </button>
            </div>
          </div>

          <div className="input-field">
            <label htmlFor="passage">{t.inputs.passageLabel}</label>
            <textarea
              id="passage"
              placeholder={t.inputs.passagePlaceholder}
              value={passage}
              onChange={(event) => setPassage(event.target.value)}
              rows={12}
            />
            <div className="char-counter">{formatMessage(t.inputs.characterCount, { count: passageCharacterCount })}</div>
          </div>

          {showSpacetimeParams && (
            <div className="input-field">
              <div className="spacetime-header">
                <label>{t.spacetime.title}</label>
                <button
                  type="button"
                  className="secondary spacetime-fill-button"
                  onClick={handleSpacetimeAutofill}
                  disabled={
                    !API_KEY ||
                    loading['spacetime-fill'] ||
                    !passage.trim()
                  }
                >
                  {loading['spacetime-fill'] ? t.buttons.spacetimeAutofillLoading : t.buttons.spacetimeAutofill}
                </button>
              </div>
              <div className="spacetime-grid">
                <label className="field">
                  <span>{t.spacetime.fields.subjectType}</span>
                  <input
                    type="text"
                    value={subjectType}
                    onChange={(event) => setSubjectType(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.focalName}</span>
                  <input
                    type="text"
                    value={focalName}
                    placeholder={t.spacetime.placeholders.focalName}
                    onChange={(event) => setFocalName(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.focalYears}</span>
                  <input
                    type="text"
                    value={focalYears}
                    placeholder={t.spacetime.placeholders.focalYears}
                    onChange={(event) => setFocalYears(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.focalCivilization}</span>
                  <input
                    type="text"
                    value={focalCivilization}
                    placeholder={t.spacetime.placeholders.focalCivilization}
                    onChange={(event) => setFocalCivilization(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.focalWork}</span>
                  <input
                    type="text"
                    value={focalWork}
                    placeholder={t.spacetime.placeholders.focalWork}
                    onChange={(event) => setFocalWork(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.workDate}</span>
                  <input
                    type="text"
                    value={workDate}
                    placeholder={t.spacetime.placeholders.workDate}
                    onChange={(event) => setWorkDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.timeWindow}</span>
                  <input
                    type="text"
                    value={timeWindow}
                    onChange={(event) => setTimeWindow(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.civilizations}</span>
                  <input
                    type="text"
                    value={civilizations}
                    onChange={(event) => setCivilizations(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.maxPerRegion}</span>
                  <input
                    type="text"
                    value={maxPerRegion}
                    onChange={(event) => setMaxPerRegion(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.audience}</span>
                  <input
                    type="text"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t.spacetime.fields.length}</span>
                  <input
                    type="text"
                    value={length}
                    onChange={(event) => setLength(event.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="actions-panel">
          <button
            type="button"
            className="main-action analysis-btn"
            onClick={handleAnalysis}
            disabled={disableActions || loading.analysis}
          >
            {loading.analysis ? t.buttons.analysisLoading : t.buttons.analysis}
          </button>

          <button
            type="button"
            className="main-action history-btn"
            onClick={handleHistory}
            disabled={disableActions || loading.history}
          >
            {loading.history ? t.buttons.historyLoading : t.buttons.history}
          </button>

          <button
            type="button"
            className="main-action scene-btn"
            onClick={handleSceneIllustrations}
            disabled={disableActions || loading['scene-images']}
          >
            {loading['scene-images'] ? t.buttons.scenesLoading : t.buttons.scenes}
          </button>

          <button
            type="button"
            className="main-action spacetime-btn"
            onClick={handleSpacetimeAnalysis}
            disabled={disableActions || loading.spacetime}
          >
            {loading.spacetime ? t.buttons.spacetimeLoading : t.buttons.spacetime}
          </button>

          <button
            type="button"
            className="main-action chat-btn"
            onClick={handleOpenAuthorChat}
            disabled={disableActions || loading['author-chat'] || isAuthorChatOpen}
          >
            {loading['author-chat']
              ? t.buttons.chatLoading
              : isAuthorChatOpen
                ? t.buttons.chatActive
                : t.buttons.chat}
          </button>
        </section>

        {(errors.analysis ||
          errors.history ||
          errors['scene-images'] ||
          errors['passage-fill'] ||
          errors.spacetime ||
          errors['author-chat'] ||
          errors['spacetime-fill']) && (
          <section className="error-panel">
            {Object.entries(errors)
              .filter(([, value]) => Boolean(value))
              .map(([key, entry]) => {
                if (!entry) {
                  return null;
                }
                const message = entry.type === 'code' ? t.errors[entry.code] : entry.message;
                return <p key={key}>{message}</p>;
              })}
          </section>
        )}

        <section className="results-panel">
          {isAuthorChatOpen && (
            <div className="result-block">
              <div className="result-card author-chat-card">
                <div className="chat-header">
                  <h3>{t.chat.title}</h3>
                </div>
                <div className="chat-history" ref={chatContainerRef}>
                  {authorChatMessages.length === 0 ? (
                    <p className="chat-placeholder">{chatPlaceholder}</p>
                  ) : (
                    authorChatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`chat-message ${message.role === 'author' ? 'author' : 'user'}`}
                      >
                        <span className="chat-sender">
                          {message.role === 'author' ? author || t.chat.placeholderAuthorFallback : t.chat.youLabel}
                        </span>
                        <div className="chat-bubble">{message.content}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="chat-input-area">
                  <textarea
                    placeholder={chatPlaceholder}
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    rows={3}
                    disabled={loading['author-chat']}
                  />
                  <button
                    type="button"
                    className="primary"
                    onClick={handleSendAuthorChat}
                    disabled={loading['author-chat'] || !chatDraft.trim()}
                  >
                    {loading['author-chat'] ? t.buttons.sendLoading : t.buttons.send}
                  </button>
                </div>
              </div>
            </div>
          )}

          {analysisResult && (
            <div className="result-block">
              {renderAnalysisResult()}
              <div className="export-actions">
                <button
                  type="button"
                  onClick={() => downloadHtml('translation-analysis.html', analysisHtml)}
                >
                  {t.buttons.downloadHtml}
                </button>
              </div>
            </div>
          )}

          {historyResult && (
            <div className="result-block">
              <div className="result-card" ref={historyRef}>
                <h3>{historyStrings.title}</h3>
                <section>
                  <h4>{historyStrings.overview}</h4>
                  <p>{historyResult.overview}</p>
                </section>
                <section>
                  <h4>{historyStrings.events}</h4>
                  <ul>
                    {historyResult.recentEvents.map((event, index) => (
                      <li key={`history-${index}`}>{event}</li>
                    ))}
                  </ul>
                </section>
              </div>
              <div className="export-actions">
                <button
                  type="button"
                  onClick={() => downloadHtml('historical-context.html', historyHtml)}
                >
                  {t.buttons.downloadHtml}
                </button>
              </div>
            </div>
          )}

          {sceneImages.length > 0 && (
            <div className="result-block">
              <h3>{scenesStrings.title}</h3>
              <p className="note">{formatMessage(scenesStrings.note, { count: sceneImages.length })}</p>
              <div className="image-grid">
                {sceneImages.map((image) => (
                  <figure key={image.id}>
                    <img
                      src={`data:${image.mimeType};base64,${image.base64Data}`}
                      alt={image.title}
                      loading="lazy"
                    />
                    <figcaption>{image.title}</figcaption>
                    <p className="prompt-text">{`${scenesStrings.promptLabel}${image.prompt}`}</p>

                    {previousImages[image.id] && (
                      <div className="revert-section">
                        <button
                          type="button"
                          className="revert-button"
                          onClick={() => handleRevertImage(image.id)}
                        >
                          {t.buttons.revertImage}
                        </button>
                        <p className="revert-hint">{scenesStrings.revertHint}</p>
                      </div>
                    )}

                    <div className="edit-panel">
                      <textarea
                        placeholder={scenesStrings.editPlaceholder}
                        value={editValues[image.id] || ''}
                        onChange={(event) => handleEditPromptChange(image.id, event.target.value)}
                        rows={3}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleEditImage(image)}
                        disabled={editLoading[image.id]}
                      >
                        {editLoading[image.id] ? t.buttons.editLoading : t.buttons.submitEdit}
                      </button>
                    </div>
                    <div className="export-actions">
                      <button
                        type="button"
                        onClick={() => downloadSingleImage(image)}
                      >
                        {t.buttons.downloadImage}
                      </button>
                    </div>
                  </figure>
                ))}
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => downloadImagesAsZip(sceneImages, 'scene-illustrations.zip')}
              >
                {t.buttons.downloadAllImages}
              </button>
            </div>
          )}

          {comparativeResult && (
            <div className="result-block">
              <div className="result-card">
                <h3>{comparativeStrings.title}</h3>
                <section>
                  <h4>{comparativeStrings.overview}</h4>
                  <p>{comparativeResult.executiveSnapshot}</p>
                </section>
                <section>
                  <h4>{formatMessage(comparativeStrings.timeline, { years: timeWindow })}</h4>
                  <table className="timeline-table">
                    <thead>
                      <tr>
                        <th>{comparativeStrings.tableHeaders.timelineYear}</th>
                        <th>{comparativeStrings.tableHeaders.timelineDetail}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparativeResult.timelineAnchors.map((item, index) => (
                        <tr key={`timeline-${index}`}>
                          <td>{item.year}</td>
                          <td>{item.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section>
                  <h4>{comparativeStrings.shortlist}</h4>
                  {comparativeResult.comparatorShortlist.map((region, regionIndex) => (
                    <div key={`region-${regionIndex}`} className="comparator-region">
                      <h5>{region.region}</h5>
                      <ul>
                        {region.figures.map((figure, idx) => {
                          const worksText =
                            figure.hallmarkWorks.length > 0
                              ? figure.hallmarkWorks.join('；')
                              : comparativeStrings.unknownWork;
                          const rationaleText = figure.rationale || comparativeStrings.unknownReason;
                          const summary = `${comparativeStrings.worksLabel}${worksText}${comparativeStrings.detailSeparator}${comparativeStrings.rationaleLabel}${rationaleText}`;
                          return (
                            <li key={`figure-${regionIndex}-${idx}`}>
                              <strong>{figure.name}</strong>
                              {' — '}
                              {summary}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
                <section>
                  <h4>{comparativeStrings.matrix}</h4>
                  <div className="matrix-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{comparativeStrings.tableHeaders.figure}</th>
                          <th>{comparativeStrings.tableHeaders.works}</th>
                          <th>{comparativeStrings.tableHeaders.form}</th>
                          <th>{comparativeStrings.tableHeaders.style}</th>
                          <th>{comparativeStrings.tableHeaders.themes}</th>
                          <th>{comparativeStrings.tableHeaders.context}</th>
                          <th>{comparativeStrings.tableHeaders.influence}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparativeResult.comparisonMatrix.map((row, index) => (
                          <tr key={`matrix-${index}`}>
                            <td>
                              {row.figure}
                              <br />
                              <span className="muted">{row.region}</span>
                            </td>
                            <td>{row.keyWorks}</td>
                            <td>{row.formGenre}</td>
                            <td>{row.styleTechnique}</td>
                            <td>{row.themes}</td>
                            <td>{row.context}</td>
                            <td>{row.influence}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
              <div className="export-actions">
                <button
                  type="button"
                  onClick={() => downloadHtml('comparative-analysis.html', comparativeHtml)}
                >
                  {t.buttons.downloadHtml}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer>
        <p>{t.footer}</p>
      </footer>
    </div>
  );
};

export default App;
