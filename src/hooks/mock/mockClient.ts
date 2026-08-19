/**
 * モック実装（ローカル開発用）
 */

import type { AgentCoreCallbacks, ModelType } from '../api/agentCoreClient';
import type { ReferenceFile } from '../../components/Chat/types';
import type { ShareResult } from '../api/exportClient';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * エージェント実行モック
 */
export async function invokeAgentMock(
  prompt: string,
  _currentMarkdown: string,
  _theme: string,
  callbacks: AgentCoreCallbacks,
  _sessionId?: string,
  _modelType: ModelType = 'kimi',
  _referenceFile?: ReferenceFile
): Promise<void> {
  void _modelType;
  void _referenceFile;

  // 思考過程をストリーミング
  const thinkingText = `${prompt}についてスライドを作成しますね。\n\n構成を考えています...`;
  for (const char of thinkingText) {
    callbacks.onText(char);
    await sleep(20);
  }

  const sourceUrl = prompt.match(/https?:\/\/[^\s]+/)?.[0];
  const transitionDelay = sourceUrl ? 2500 : 800;
  if (sourceUrl) {
    callbacks.onToolUse('web_search', prompt);
    await sleep(transitionDelay);
    callbacks.onToolUse('http_request', sourceUrl);
    await sleep(transitionDelay);
  } else {
    // 本番のGrokは論点を分けて4〜6回検索する。検索が1回しかないモックだと、
    // 完了した行が積み上がったときの見え方をローカルで確認できない。
    const mockQueries = [
      `${prompt} 概要`,
      `${prompt} 最新 事例`,
      `${prompt} 公式 ドキュメント`,
      `${prompt} 導入 判断`,
    ];
    for (const query of mockQueries) {
      callbacks.onToolUse('web_search', query);
      await sleep(700);
    }
  }

  // ツール使用開始
  callbacks.onToolUse('output_slide');
  await sleep(transitionDelay);
  callbacks.onSlideProgress?.(
    '文字や表のはみ出しを検知したので、スライドを修正します'
  );
  await sleep(transitionDelay);
  callbacks.onToolUse('output_slide');
  await sleep(transitionDelay);

  // サンプルマークダウンを生成
  const sampleMarkdown = `---
marp: true
theme: border
size: 16:9
paginate: true
---

# ${prompt}

サンプルスライド

---

# スライド 2

- ポイント 1
- ポイント 2
- ポイント 3

---

# まとめ

ご清聴ありがとうございました
`;

  callbacks.onMarkdown(sampleMarkdown);
  callbacks.onText('\n\nスライドを生成しました！プレビュータブで確認できます。');

  // シェアリクエストの場合はツイートURLを生成
  if (prompt.includes('シェア') || prompt.includes('ツイート')) {
    callbacks.onToolUse('generate_tweet_url');
    await sleep(500);
    const tweetText = encodeURIComponent(`#パワポ作るマン でスライドを作ってみました。これは便利！ pawapo.minoruonda.com`);
    callbacks.onTweetUrl?.(`https://twitter.com/intent/tweet?text=${tweetText}`);
  }

  callbacks.onComplete();
}

/**
 * PDF生成モック
 */
export async function exportPdfMock(markdown: string, _theme: string = 'border'): Promise<Blob> {
  void _theme;
  await sleep(1000);
  return new Blob([markdown], { type: 'text/markdown' });
}

/**
 * PPTX生成モック
 */
export async function exportPptxMock(markdown: string, _theme: string = 'border'): Promise<Blob> {
  void _theme;
  await sleep(1000);
  return new Blob([markdown], { type: 'text/markdown' });
}

/**
 * 編集可能PPTX生成モック
 */
export async function exportEditablePptxMock(markdown: string, _theme: string = 'border'): Promise<Blob> {
  void _theme;
  await sleep(2000);
  return new Blob([markdown], { type: 'text/markdown' });
}

/**
 * スライド共有モック
 */
export async function shareSlideMock(_markdown: string, _theme: string = 'border'): Promise<ShareResult> {
  void _theme;
  await sleep(1000);
  const mockSlideId = crypto.randomUUID();
  return {
    url: `https://slides.pawapo.minoruonda.com/${mockSlideId}/index.html`,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
}
