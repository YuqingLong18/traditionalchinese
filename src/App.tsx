import { Fragment, useRef, useState } from 'react';
import './App.css';
import type {
  AnalysisResult,
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
  'passage-fill': boolean;
  spacetime: boolean;
};

type ErrorState = Partial<Record<keyof LoadingState, string>>;

type EditLoadingState = Record<string, boolean>;

type EditValueState = Record<string, string>;

const initialLoading: LoadingState = {
  analysis: false,
  history: false,
  'scene-images': false,
  'passage-fill': false,
  spacetime: false,
};

const initialErrors: ErrorState = {};

type PreviousImageState = Record<string, ImageAsset>;

const App = () => {
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

  const passageCharacterCount = passage.replace(/\s+/g, '').length;

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

  const handleFillPassage = async () => {
    if (!API_KEY) {
      setErrors((prev) => ({ ...prev, 'passage-fill': '未检测到环境变量 VITE_OPENROUTER_API_KEY，请先完成配置。' }));
      return;
    }

    if (!author.trim() || !workTitle.trim()) {
      setErrors((prev) => ({ ...prev, 'passage-fill': '请先填写作者与作品名称。' }));
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
      const message = error instanceof Error ? error.message : '未能自动填充正文，请稍后再试。';
      setErrors((prev) => ({ ...prev, 'passage-fill': message }));
    } finally {
      setLoadingFor('passage-fill', false);
    }
  };

  const handleSpacetimeAnalysis = async () => {
    if (!guardInputs('spacetime')) {
      return;
    }

    if (!focalName.trim() || !focalYears.trim() || !focalCivilization.trim()) {
      setErrors((prev) => ({ ...prev, spacetime: '请完善核心人物信息（姓名、生卒年份、文明）。' }));
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
      const message = error instanceof Error ? error.message : '构建时空分析失败，请稍后再试。';
      setErrors((prev) => ({ ...prev, spacetime: message }));
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


  const buildComparativeHtml = (result: ComparativeAnalysisResult): string => {
    const timelineRows = result.timelineAnchors
      .map((item) => `<tr><td>${escapeHtml(item.year)}</td><td>${escapeHtml(item.detail)}</td></tr>`)
      .join('');

    const comparatorSections = result.comparatorShortlist
      .map((region) => {
        const items = region.figures
          .map(
            (figure) =>
              `<li>${escapeHtml(figure.name)} — 作品：${escapeHtml(
                figure.hallmarkWorks.length > 0 ? figure.hallmarkWorks.join('；') : '未注明作品',
              )}。理由：${escapeHtml(figure.rationale || '未提供理由')}</li>`,
          )
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

    return `\\n<section>\\n  <h2>构建时空比较分析</h2>\\n  <h3>总览</h3>\\n  <p>${escapeHtml(result.executiveSnapshot)}</p>\\n  <h3>时间锚点</h3>\\n  <table border=\"1\" cellpadding=\"6\" cellspacing=\"0\">\\n    <thead><tr><th>年份</th><th>事件 / 人物 / 作品（地区）</th></tr></thead>\\n    <tbody>${timelineRows}</tbody>\\n  </table>\\n  <h3>对比名单</h3>\\n  ${comparatorSections}\\n  <h3>比较矩阵</h3>\\n  <table border=\"1\" cellpadding=\"6\" cellspacing=\"0\">\\n    <thead><tr><th>人物（地区）</th><th>代表作品</th><th>体裁</th><th>风格技法</th><th>主题</th><th>历史语境</th><th>影响 / 传播</th></tr></thead>\\n    <tbody>${matrixRows}</tbody>\\n  </table>\\n</section>`;
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

  const comparativeHtml = comparativeResult ? buildComparativeHtml(comparativeResult) : '';

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
          <div className="author-work-row">
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
              <label htmlFor="work-title">作品名称</label>
              <input
                id="work-title"
                type="text"
                placeholder="示例：静夜思"
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
                {loading['passage-fill'] ? '填充中…' : '填充正文'}
              </button>
            </div>
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

          <div className="input-field">
            <label>构建时空参数</label>
            <div className="spacetime-grid">
              <label className="field">
                <span>人物类型</span>
                <input
                  type="text"
                  value={subjectType}
                  onChange={(event) => setSubjectType(event.target.value)}
                />
              </label>
              <label className="field">
                <span>核心人物</span>
                <input
                  type="text"
                  value={focalName}
                  placeholder="示例：李白"
                  onChange={(event) => setFocalName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>生卒年份</span>
                <input
                  type="text"
                  value={focalYears}
                  placeholder="示例：701–762"
                  onChange={(event) => setFocalYears(event.target.value)}
                />
              </label>
              <label className="field">
                <span>文明体系</span>
                <input
                  type="text"
                  value={focalCivilization}
                  placeholder="示例：唐代中国"
                  onChange={(event) => setFocalCivilization(event.target.value)}
                />
              </label>
              <label className="field">
                <span>核心作品</span>
                <input
                  type="text"
                  value={focalWork}
                  placeholder="示例：静夜思"
                  onChange={(event) => setFocalWork(event.target.value)}
                />
              </label>
              <label className="field">
                <span>作品年代</span>
                <input
                  type="text"
                  value={workDate}
                  placeholder="示例：盛唐"
                  onChange={(event) => setWorkDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>时间窗口（年）</span>
                <input
                  type="text"
                  value={timeWindow}
                  onChange={(event) => setTimeWindow(event.target.value)}
                />
              </label>
              <label className="field">
                <span>跨文化范围</span>
                <input
                  type="text"
                  value={civilizations}
                  onChange={(event) => setCivilizations(event.target.value)}
                />
              </label>
              <label className="field">
                <span>每区人数上限</span>
                <input
                  type="text"
                  value={maxPerRegion}
                  onChange={(event) => setMaxPerRegion(event.target.value)}
                />
              </label>
              <label className="field">
                <span>受众与语气</span>
                <input
                  type="text"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                />
              </label>
              <label className="field">
                <span>目标篇幅</span>
                <input
                  type="text"
                  value={length}
                  onChange={(event) => setLength(event.target.value)}
                />
              </label>
            </div>
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

          <button
            type="button"
            className="primary"
            onClick={handleSpacetimeAnalysis}
            disabled={disableActions || loading.spacetime}
          >
            {loading.spacetime ? '构建中…' : '构建时空'}
          </button>
        </section>

        {(errors.analysis || errors.history || errors['scene-images'] || errors['passage-fill'] || errors.spacetime) && (
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
                    
                    {/* Show revert button if there's a previous version */}
                    {previousImages[image.id] && (
                      <div className="revert-section">
                        <button
                          type="button"
                          className="revert-button"
                          onClick={() => handleRevertImage(image.id)}
                        >
                          退回修改
                        </button>
                        <p className="revert-hint">可恢复到修改前的版本</p>
                      </div>
                    )}
                    
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

          {comparativeResult && (
            <div className="result-block">
              <div className="result-card">
                <h3>构建时空比较分析</h3>
                <section>
                  <h4>总览</h4>
                  <p>{comparativeResult.executiveSnapshot}</p>
                </section>
                <section>
                  <h4>时间锚点（±{timeWindow} 年）</h4>
                  <table className="timeline-table">
                    <thead>
                      <tr>
                        <th>年份</th>
                        <th>事件 / 人物 / 作品（地区）</th>
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
                  <h4>对比名单</h4>
                  {comparativeResult.comparatorShortlist.map((region, regionIndex) => (
                    <div key={`region-${regionIndex}`} className="comparator-region">
                      <h5>{region.region}</h5>
                      <ul>
                        {region.figures.map((figure, idx) => (
                          <li key={`figure-${regionIndex}-${idx}`}>
                            <strong>{figure.name}</strong> — 作品：{figure.hallmarkWorks.join('；')}。理由：
                            {figure.rationale}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
                <section>
                  <h4>比较矩阵</h4>
                  <div className="matrix-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>人物（地区）</th>
                          <th>代表作品</th>
                          <th>体裁</th>
                          <th>风格技法</th>
                          <th>主题</th>
                          <th>历史语境</th>
                          <th>影响 / 传播</th>
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
                  下载 HTML
                </button>
              </div>
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
