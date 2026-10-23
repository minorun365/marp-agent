/**
 * 運営者（Cognito の owner グループ）だけに出す非公開テーマの取得。
 * 中身はエージェント経由で非公開の S3 から届く（agent/private_themes.py）。
 * owner でなければエージェントを呼ばない（呼び出しが利用統計のセッションに数えられるため）。
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import type { SlideTheme } from '../../components/SlidePreview';
import { getAgentCoreConfig } from './agentCoreClient';
import { readSSEStream } from '../streaming/sseParser';

const OWNER_GROUP = 'owner';

export function isOwner(groups: unknown): boolean {
  return Array.isArray(groups) && groups.includes(OWNER_GROUP);
}

function isSlideTheme(value: unknown): value is SlideTheme {
  const theme = value as SlideTheme;
  return typeof theme?.id === 'string' && typeof theme?.name === 'string' && typeof theme?.css === 'string';
}

export async function fetchPrivateThemes(): Promise<SlideTheme[]> {
  const session = await fetchAuthSession();
  if (!isOwner(session.tokens?.accessToken?.payload['cognito:groups'])) return [];

  const { url, accessToken } = await getAgentCoreConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'list_private_themes' }),
  });
  const reader = response.ok ? response.body?.getReader() : undefined;
  if (!reader) return [];

  let themes: SlideTheme[] = [];
  await readSSEStream(reader, (event) => {
    if (event.type === 'private_themes' && Array.isArray(event.themes)) {
      themes = event.themes.filter(isSlideTheme);
      return 'stop';
    }
  });
  return themes;
}
