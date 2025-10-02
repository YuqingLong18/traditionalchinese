import { Fragment, useRef, useState } from 'react';
import './App.css';
import type {
  AnalysisResult,
  HistoricalContextResult,
  ImageAsset,
} from './types';
import {
  editIllustration,
  generateAnalysis,
  generateHistoricalContext,
  generateIllustrations,
  ModelJsonError,
} from './utils/api';
import {
  downloadHtml,
  downloadImagesAsZip,
  downloadSingleImage,
} from './utils/download';

/**
 * 页面加载后解析到的 OpenRouter API Key。任何生成操作都依赖此变量。
 */
const API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY ?? '').trim();

type LoadingState = {
  analysis: boolean;
  history: boolean;
  'scene-images': boolean;
};

type ErrorState = Partial<Record<keyof LoadingState, string>>;

type EditLoadingState = Record<string, boolean>;

type EditValueState = Record<string, string>;

const initialLoading: LoadingState = {
  analysis: false,
  history: false,
  'scene-images': false,
};

const initialErrors: ErrorState = {};

type PreviousImageState = Record<string, ImageAsset>;

const App = () => {
  const [author, setAuthor] = useState('');
  const [passage, setPassage] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [historyResult, setHistoryResult] = useState<HistoricalContextResult | null>(null);
  const [sceneImages, setSceneImages] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState<LoadingState>(initialLoading);
  const [errors, setErrors] = useState<ErrorState>(initialErrors);
  const [editLoading, setEditLoading] = useState<EditLoadingState>({});
  const [editValues, setEditValues] = useState<EditValueState>({});
  const [previousImages, setPreviousImages] = useState<PreviousImageState>({});

  const analysisRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  const passageCharacterCount = passage.replace(/\s+/g, '').length;

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const resetErrorsFor = (key: keyof LoadingState) => {
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const setLoadingFor = (key: keyof LoadingState, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  };

  const guardInputs = (requiredKey: keyof LoadingState): boolean => {
    if (!API_KEY) {
      setErrors((prev) => ({ ...prev, [requiredKey]: '未检测到环境变量 VITE_OPENROUTER_API_KEY，请先完成配置。' }));
      return false;
    }
    if (!passage.trim()) {
      setErrors((prev) => ({ ...prev, [requiredKey]: '请输入需要解析的文言文内容。' }));
      return false;
    }
    return true;
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
      const message = error instanceof Error ? error.message : '生成过程中出现未知错误。';
      setErrors((prev) => ({ ...prev, analysis: message }));
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
      const message = error instanceof Error ? error.message : '生成过程中出现未知错误。';
      setErrors((prev) => ({ ...prev, history: message }));
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
      const message = error instanceof Error ? error.message : '图像生成失败，请稍后再试。';
      setErrors((prev) => ({ ...prev, 'scene-images': message }));
    } finally {
      setLoadingFor('scene-images', false);
    }
  };

  const handleEditPromptChange = (imageId: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [imageId]: value }));
  };

  const handleEditImage = async (image: ImageAsset) => {
    const editPrompt = (editValues[image.id] || '').trim();
    if (!editPrompt) {
      setErrors((prev) => ({ ...prev, 'scene-images': '请输入具体的修改提示。' }));
      return;
    }

    setEditLoading((prev) => ({ ...prev, [image.id]: true }));
    resetErrorsFor('scene-images');

    try {
      // Save the current image before editing
      setPreviousImages((prev) => ({ ...prev, [image.id]: image }));
      
      const updated = await editIllustration(API_KEY, image, editPrompt, 'scene-images');
      setSceneImages((prev) => prev.map((item) => (item.id === image.id ? updated : item)));
      setEditValues((prev) => ({ ...prev, [image.id]: '' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '图像编辑失败，请稍后再试。';
      setErrors((prev) => ({ ...prev, 'scene-images': message }));
    } finally {
      setEditLoading((prev) => ({ ...prev, [image.id]: false }));
    }
  };

  const handleRevertImage = (imageId: string) => {
  const previousImage = previousImages[imageId];
  if (!previousImage) {
    return;
  }

  // Restore the previous image
  setSceneImages((prev) => prev.map((item) => (item.id === imageId ? previousImage : item)));
  
  // Remove from previous images tracking
  setPreviousImages((prev) => {
    const updated = { ...prev };
    delete updated[imageId];
    return updated;
  });
  
  // Clear any edit prompt for this image
  setEditValues((prev) => ({ ...prev, [imageId]: '' }));
  };
  
  const renderAnalysisResult = () => {
    if (!analysisResult) {
      return null;
    }

    return (
      <div className="result-card" ref={analysisRef}>
        <h3>逐句翻译与解析</h3>
        <div className="sentence-grid">
          <div className="sentence-header">原文</div>
          <div className="sentence-header">现代汉语翻译</div>
          <div className="sentence-header">关键词与解析</div>
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

  const analysisHtml = analysisResult
    ? `\n<section>\n  <h2>逐句翻译与解析</h2>\n  <table border="1" cellpadding="8" cellspacing="0">\n    <thead>\n      <tr>\n        <th>原文</th>\n        <th>现代汉语翻译</th>\n        <th>关键词与解析</th>\n      </tr>\n    </thead>\n    <tbody>\n      ${analysisResult.sentences
        .map(
          (sentence) => `\n        <tr>\n          <td>${escapeHtml(sentence.original)}</td>\n          <td>${escapeHtml(sentence.simplified)}</td>\n          <td><ul>${sentence.explanation
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join('')}</ul></td>\n        </tr>`,
        )
        .join('')}\n    </tbody>\n  </table>\n</section>`
    : '';

  const historyHtml = historyResult
    ? `\n<section>\n  <h2>历史背景分析</h2>\n  <p>${escapeHtml(historyResult.overview)}</p>\n  <h3>成稿前 1-3 年关键事件</h3>\n  <ul>${historyResult.recentEvents
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>\n</section>`
    : '';

  const disableActions = !passage.trim() || !API_KEY;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>传统文学教学助手</h1>
          <p>面向课堂教学的文言文翻译、解析与图像生成工具</p>
        </div>
        <div
          className={`status-chip ${API_KEY ? '' : 'warning'}`}
          role="status"
          aria-live="polite"
        >
          状态：{API_KEY ? 'OK' : '服务未就绪'}
        </div>
      </header>

      <main>
        <section className="input-panel">
          <div className="input-field">
            <label htmlFor="author">作者姓名</label>
            <input
              id="author"
              type="text"
              placeholder="示例：李白"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
            />
          </div>

          <div className="input-field">
            <label htmlFor="passage">文言原文</label>
            <textarea
              id="passage"
              placeholder="请粘贴需要教学的古典诗文，系统将生成现代汉语翻译、解析与情境插图。"
              value={passage}
              onChange={(event) => setPassage(event.target.value)}
              rows={12}
            />
            <div className="char-counter">字数：{passageCharacterCount}</div>
          </div>
        </section>

        <section className="actions-panel">
          <button
            type="button"
            className="primary"
            onClick={handleAnalysis}
            disabled={disableActions || loading.analysis}
          >
            {loading.analysis ? '生成中…' : '翻译与逐句解析'}
          </button>

          <button
            type="button"
            className="primary"
            onClick={handleHistory}
            disabled={disableActions || loading.history}
          >
            {loading.history ? '分析中…' : '历史背景分析'}
          </button>

          <button
            type="button"
            className="secondary"
            onClick={handleSceneIllustrations}
            disabled={disableActions || loading['scene-images']}
          >
            {loading['scene-images'] ? '绘制中…' : '作品场景插图'}
          </button>
        </section>

        {(errors.analysis || errors.history || errors['scene-images']) && (
          <section className="error-panel">
            {Object.entries(errors)
              .filter(([, value]) => Boolean(value))
              .map(([key, message]) => (
                <p key={key}>{message}</p>
              ))}
          </section>
        )}

        <section className="results-panel">
          {analysisResult && (
            <div className="result-block">
              {renderAnalysisResult()}
              <div className="export-actions">
                <button
                  type="button"
                  onClick={() => downloadHtml('translation-analysis.html', analysisHtml)}
                >
                  下载 HTML
                </button>
              </div>
            </div>
          )}

          {historyResult && (
            <div className="result-block">
              <div className="result-card" ref={historyRef}>
                <h3>历史背景分析</h3>
                <section>
                  <h4>作者整体概览</h4>
                  <p>{historyResult.overview}</p>
                </section>
                <section>
                  <h4>成稿前 1-3 年关键事件</h4>
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
                  下载 HTML
                </button>
              </div>
            </div>
          )}

          {sceneImages.length > 0 && (
            <div className="result-block">
              <h3>作品场景插图</h3>
              <p className="note">系统根据文段自动确定图像数量，共 {sceneImages.length} 张。</p>
              <div className="image-grid">
                {sceneImages.map((image) => (
                  <figure key={image.id}>
                    <img
                      src={`data:${image.mimeType};base64,${image.base64Data}`}
                      alt={image.title}
                      loading="lazy"
                    />
                    <figcaption>{image.title}</figcaption>
                    <p className="prompt-text">提示词：{image.prompt}</p>
                    <div className="edit-panel">
                      <textarea
                        placeholder="输入修改提示，例如：加入高山云海，增强远景层次。"
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
                        {editLoading[image.id] ? '编辑中…' : '提交修改'}
                      </button>
                    </div>
                    <div className="export-actions">
                      <button
                        type="button"
                        onClick={() => downloadSingleImage(image)}
                      >
                        下载此图
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
                下载全部插图（ZIP）
              </button>
            </div>
          )}
        </section>
      </main>

      <footer>
        <p>生成图像可能产生额外的 API 费用，请在课堂前完成额度确认。若调用失败，请稍后重试或缩短输入文本。</p>
      </footer>
    </div>
  );
};

export default App;
