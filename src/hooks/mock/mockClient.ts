/**
 * モック実装（ローカル開発用）
 */

import type { AgentCoreCallbacks, ModelType } from '../api/agentCoreClient';
import type { ShareResult } from '../api/exportClient';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * エージェント実行モック
 */
export async function invokeAgentMock(
  prompt: string,
  _currentMarkdown: string,
  callbacks: AgentCoreCallbacks,
  _sessionId?: string,
  _modelType: ModelType = 'claude'
): Promise<void> {
  // 思考過程をストリーミング
  const thinkingText = `${prompt}についてスライドを作成しますね。\n\n構成を考えています...`;
  for (const char of thinkingText) {
    callbacks.onText(char);
    await sleep(20);
  }

  // ツール使用開始
  callbacks.onToolUse('output_slide');
  await sleep(1000);

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
export async function exportPdfMock(markdown: string, _theme: string = 'kag'): Promise<Blob> {
  await sleep(1000);
  return new Blob([markdown], { type: 'text/markdown' });
}

/**
 * PPTX生成モック
 */
export async function exportPptxMock(markdown: string, _theme: string = 'kag'): Promise<Blob> {
  await sleep(1000);
  return new Blob([markdown], { type: 'text/markdown' });
}

/**
 * スライド共有モック
 */
export async function shareSlideMock(_markdown: string, _theme: string = 'gradient'): Promise<ShareResult> {
  await sleep(1000);
  const mockSlideId = crypto.randomUUID();
  return {
    url: `https://mock.cloudfront.net/slides/${mockSlideId}/index.html`,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
}
