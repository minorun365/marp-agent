import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../../amplify_outputs.json';

export interface AgentCoreCallbacks {
  onText: (text: string) => void;
  onStatus: (status: string) => void;
  onMarkdown: (markdown: string) => void;
  onTweetUrl?: (url: string) => void;
  onToolUse: (toolName: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export async function invokeAgent(
  prompt: string,
  currentMarkdown: string,
  callbacks: AgentCoreCallbacks,
  sessionId?: string
): Promise<void> {
  const runtimeArn = outputs.custom?.agentRuntimeArn;
  if (!runtimeArn) {
    callbacks.onError(new Error('AgentCore runtime ARN not configured'));
    return;
  }

  // ARNからリージョンを抽出
  // 形式: arn:aws:bedrock-agentcore:{region}:{accountId}:runtime/{runtimeId}
  const arnParts = runtimeArn.split(':');
  const region = arnParts[3];

  // ARNをURLエンコード
  const encodedArn = encodeURIComponent(runtimeArn);

  // AgentCore APIエンドポイント（DEFAULTエンドポイントを使用）
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`;

  try {
    // Cognito認証トークンを取得（AgentCoreはclient_idクレームを検証するためアクセストークンが必要）
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();

    if (!accessToken) {
      callbacks.onError(new Error('認証が必要です。ログインしてください。'));
      return;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        prompt,
        markdown: currentMarkdown,
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            callbacks.onComplete();
            return;
          }

          try {
            const event = JSON.parse(data);
            handleEvent(event, callbacks);
          } catch {
            // JSONパースエラーは無視
          }
        }
      }
    }

    callbacks.onComplete();
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

function handleEvent(
  event: { type?: string; content?: string; data?: string; error?: string; message?: string },
  callbacks: AgentCoreCallbacks
) {
  // APIはcontent または data フィールドでデータを返す
  const textValue = event.content || event.data;

  switch (event.type) {
    case 'text':
      if (textValue) {
        callbacks.onText(textValue);
      }
      break;
    case 'status':
      if (textValue) {
        callbacks.onStatus(textValue);
      }
      break;
    case 'markdown':
      if (textValue) {
        callbacks.onMarkdown(textValue);
      }
      break;
    case 'tweet_url':
      if (textValue && callbacks.onTweetUrl) {
        callbacks.onTweetUrl(textValue);
      }
      break;
    case 'tool_use':
      if (textValue) {
        callbacks.onToolUse(textValue);
      }
      break;
    case 'error':
      if (event.error || event.message || textValue) {
        callbacks.onError(new Error(event.error || event.message || textValue));
      }
      break;
    default:
      // エラーフィールドがある場合はエラーとして処理
      if (event.error) {
        callbacks.onError(new Error(event.error));
      }
      // dataフィールドがある場合はテキストとして扱う
      else if (textValue) {
        callbacks.onText(textValue);
      }
  }
}

// PDF生成（本番API）
export async function exportPdf(markdown: string): Promise<Blob> {
  const runtimeArn = outputs.custom?.agentRuntimeArn;
  if (!runtimeArn) {
    throw new Error('AgentCore runtime ARN not configured');
  }

  // ARNからリージョンを抽出
  const arnParts = runtimeArn.split(':');
  const region = arnParts[3];

  const encodedArn = encodeURIComponent(runtimeArn);
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`;

  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken?.toString();

  if (!accessToken) {
    throw new Error('認証が必要です。ログインしてください。');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: 'export_pdf',
      markdown,
    }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          if (event.type === 'pdf' && event.data) {
            // Base64デコードしてBlobを返す
            const binaryString = atob(event.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return new Blob([bytes], { type: 'application/pdf' });
          } else if (event.type === 'error') {
            throw new Error(event.message || event.error || 'PDF生成エラー');
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'PDF生成エラー') {
            // JSONパースエラーは無視、ただしPDF生成エラーは再throw
            if (e.message.includes('PDF') || e.message.includes('API')) {
              throw e;
            }
          } else {
            throw e;
          }
        }
      }
    }
  }

  throw new Error('PDF生成に失敗しました');
}

// PDF生成モック（ローカル開発用）
export async function exportPdfMock(markdown: string): Promise<Blob> {
  // モックではマークダウンをテキストとして返す
  await new Promise(resolve => setTimeout(resolve, 1000));
  return new Blob([markdown], { type: 'text/markdown' });
}

// モック実装（ローカル開発用）
export async function invokeAgentMock(
  prompt: string,
  _currentMarkdown: string,
  callbacks: AgentCoreCallbacks,
  _sessionId?: string
): Promise<void> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
