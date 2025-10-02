import { Fragment, useRef, useState } from 'react';
import './App.css';
import type {
  AnalysisResult,
  AuthorBackgroundResult,
  ImageAsset,
} from './types';
import {
  generateAnalysis,
  generateAuthorBackground,
  generateIllustrations,
} from './utils/api';
import {
  downloadHtml,
  downloadImagesAsZip,
  downloadPdfFromElement,
  downloadSingleImage,
} from './utils/download';

type LoadingState = {
  analysis: boolean;
  author: boolean;
  'story-images': boolean;
  'scene-images': boolean;
};

type ErrorState = Partial<Record<keyof LoadingState, string>>;

const initialLoading: LoadingState = {
  analysis: false,
  author: false,
  'story-images': false,
  'scene-images': false,
};

const initialErrors: ErrorState = {};

const App = () => {
  const [author, setAuthor] = useState('');
  const [passage, setPassage] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [authorResult, setAuthorResult] = useState<AuthorBackgroundResult | null>(null);
  const [storyImages, setStoryImages] = useState<ImageAsset[]>([]);
  const [sceneImages, setSceneImages] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState<LoadingState>(initialLoading);
  const [errors, setErrors] = useState<ErrorState>(initialErrors);

  const analysisRef = useRef<HTMLDivElement | null>(null);
  const authorRef = useRef<HTMLDivElement | null>(null);

  const apiKey = (import.meta.env.VITE_OPENROUTER_API_KEY ?? '').trim();
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
    if (!apiKey) {
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
      const result = await generateAnalysis(apiKey, author.trim(), passage.trim());
      setAnalysisResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成过程中出现未知错误。';
      setErrors((prev) => ({ ...prev, analysis: message }));
    } finally {
      setLoadingFor('analysis', false);
    }
  };

  const handleAuthorBackground = async () => {
    if (!guardInputs('author')) {
      return;
    }

    resetErrorsFor('author');
    setLoadingFor('author', true);

    try {
      const result = await generateAuthorBackground(apiKey, author.trim(), passage.trim());
      setAuthorResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成过程中出现未知错误。';
      setErrors((prev) => ({ ...prev, author: message }));
    } finally {
      setLoadingFor('author', false);
    }
  };

  const buildStorySummary = (): string => {
    if (!authorResult) {
      return passage;
    }

    const segments = [
      authorResult.biography,
      authorResult.keyEvents.join('；'),
      authorResult.historicalContext.join('；'),
    ];

    return segments.filter(Boolean).join('。');
  };

  const handleStoryIllustrations = async () => {
    if (!guardInputs('story-images')) {
      return;
    }

    if (!authorResult) {
      setErrors((prev) => ({ ...prev, 'story-images': '请先生成作者背景，再创建背景故事插图。' }));
      return;
    }

    resetErrorsFor('story-images');
    setLoadingFor('story-images', true);

    try {
      const summary = buildStorySummary();
      const images = await generateIllustrations(
        apiKey,
        author.trim(),
        passage.trim(),
        'story-images',
        summary,
      );
      setStoryImages(images);
    } catch (error) {
      const message = error instanceof Error ? error.message : '图像生成失败，请稍后再试。';
      setErrors((prev) => ({ ...prev, 'story-images': message }));
    } finally {
      setLoadingFor('story-images', false);
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
        apiKey,
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

  const renderAuthorResult = () => {
    if (!authorResult) {
      return null;
    }

    return (
      <div className="result-card" ref={authorRef}>
        <h3>作者背景与创作脉络</h3>
        <section>
          <h4>作者简介</h4>
          <p>{authorResult.biography}</p>
        </section>
        <section>
          <h4>重要生平事件</h4>
          <ul>
            {authorResult.keyEvents.map((event, index) => (
              <li key={`event-${index}`}>{event}</li>
            ))}
          </ul>
        </section>
        <section>
          <h4>历史背景与影响</h4>
          <ul>
            {authorResult.historicalContext.map((context, index) => (
              <li key={`context-${index}`}>{context}</li>
            ))}
          </ul>
        </section>
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

  const authorHtml = authorResult
    ? `\n<section>\n  <h2>作者背景与创作脉络</h2>\n  <h3>作者简介</h3>\n  <p>${escapeHtml(authorResult.biography)}</p>\n  <h3>重要生平事件</h3>\n  <ul>${authorResult.keyEvents.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>\n  <h3>历史背景与影响</h3>\n  <ul>${authorResult.historicalContext.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>\n</section>`
    : '';

  const disableActions = !passage.trim() || !apiKey;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>传统文学教学助手</h1>
          <p>面向课堂教学的文言文翻译、解析与图像生成工具</p>
        </div>
        <div className="api-key-info" role="status">
          {apiKey ? (
            <span>已检测到环境变量 VITE_OPENROUTER_API_KEY，可直接调用 OpenRouter 服务。</span>
          ) : (
            <span className="warning">未检测到 VITE_OPENROUTER_API_KEY，请在部署环境配置后再使用生成功能。</span>
          )}
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
            onClick={handleAuthorBackground}
            disabled={disableActions || loading.author}
          >
            {loading.author ? '生成中…' : '作者背景与故事'}
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

        {(errors.analysis || errors.author || errors['scene-images'] || errors['story-images']) && (
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
                <button
                  type="button"
                  onClick={() =>
                    downloadPdfFromElement(analysisRef.current, 'translation-analysis.pdf').catch((error) =>
                      setErrors((prev) => ({ ...prev, analysis: error.message })),
                    )
                  }
                >
                  下载 PDF
                </button>
              </div>
            </div>
          )}

          {authorResult && (
            <div className="result-block">
              {renderAuthorResult()}
              <div className="export-actions">
                <button
                  type="button"
                  onClick={() => downloadHtml('author-background.html', authorHtml)}
                >
                  下载 HTML
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadPdfFromElement(authorRef.current, 'author-background.pdf').catch((error) =>
                      setErrors((prev) => ({ ...prev, author: error.message })),
                    )
                  }
                >
                  下载 PDF
                </button>
              </div>
              <div className="story-illustrations-cta">
                <p>需要进一步的故事化插图？可先生成作者背景再进行绘制。</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={handleStoryIllustrations}
                  disabled={disableActions || loading['story-images']}
                >
                  {loading['story-images'] ? '绘制中…' : '生成背景故事插图'}
                </button>
              </div>
            </div>
          )}

          {storyImages.length > 0 && (
            <div className="result-block">
              <h3>背景故事插图</h3>
              <p className="note">系统根据叙事自动确定图像数量，共 {storyImages.length} 张。</p>
              <div className="image-grid">
                {storyImages.map((image) => (
                  <figure key={image.id}>
                    <img
                      src={`data:${image.mimeType};base64,${image.base64Data}`}
                      alt={image.title}
                      loading="lazy"
                    />
                    <figcaption>{image.title}</figcaption>
                    <p className="prompt-text">提示词：{image.prompt}</p>
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
                onClick={() => downloadImagesAsZip(storyImages, 'story-illustrations.zip')}
              >
                下载全部插图（ZIP）
              </button>
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
