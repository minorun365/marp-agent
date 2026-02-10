// スライド生成中に表示する豆知識
export const TIPS = [
  'このアプリのベースは、みのるんがClaude Codeと一緒に一晩で開発しました！',
  'このアプリはAWSのBedrock AgentCoreとAmplify Gen2でフルサーバーレス構築されています。',
  'このアプリの裏では、Strands Agentsフレームワークで構築されたAIエージェントが稼働しています。',
  'このアプリはサーバーレス構成なので維持費が激安！かかる費用はほぼ推論時のAPI料金のみです。',
  'このアプリのLLMには、Amazon BedrockのClaude Sonnet 4.5を利用しています。',
  'このアプリはOSSとして、GitHub上でコードと構築方法を公開しています！',
  'みのるんのQiitaブログで、このアプリと似た構成をAWS CDKで構築する手順も紹介しています！',
  'このアプリへの感想や要望は、Xで #パワポ作るマン のハッシュタグを付けてフィードバックください！',
  'このアプリ開発者のみのるんのXアカウントは @minorun365 です。フォローしてね！',
];

// UIメッセージ定数
export const MESSAGES = {
  // 初期・プロンプト
  INITIAL: 'どんな資料を作りたいですか？ URLの要約もできます！',
  EDIT_PROMPT: 'どのように修正しますか？ 内容や枚数の調整、はみ出しの抑制もできます！',
  EMPTY_STATE_TITLE: 'スライドを作成しましょう',
  EMPTY_STATE_EXAMPLE: '例: 「AWS入門の5枚スライドを作って」',
  ERROR: 'エラーが発生しました。もう一度お試しください。',
  ERROR_MODEL_NOT_AVAILABLE: '選択されたモデルは現在利用できません。Amazon Bedrockへのモデル追加をお待ちください！',

  // ステータス - スライド生成
  SLIDE_GENERATING_PREFIX: 'スライドを作成中...',
  SLIDE_GENERATING: 'スライドを作成中...',
  SLIDE_COMPLETED: 'スライドを作成しました',

  // ステータス - Web検索
  WEB_SEARCH_PREFIX: 'Web検索中...',
  WEB_SEARCH_DEFAULT: 'Web検索中...',
  WEB_SEARCH_COMPLETED: 'Web検索完了',

  // ステータス - ツイート
  TWEET_GENERATING: 'ツイート案を作成中...',
  TWEET_COMPLETED: 'ツイート案を作成しました',
} as const;

// 検索クエリ付きのステータスを生成
export const getWebSearchStatus = (query?: string) =>
  query ? `${MESSAGES.WEB_SEARCH_PREFIX} "${query}"` : MESSAGES.WEB_SEARCH_DEFAULT;

// シェアメッセージを生成
export const getShareMessage = (url: string) =>
  `ダウンロードありがとうございます！今回の体験をXでシェアしませんか？ 👉 [ツイート](${url})`;

// モック使用フラグ（VITE_USE_MOCK=true で強制的にモック使用）
export const useMock = import.meta.env.VITE_USE_MOCK === 'true';
