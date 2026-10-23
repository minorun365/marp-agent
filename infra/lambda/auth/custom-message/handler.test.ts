import { describe, expect, it } from 'vitest';
import type { CustomMessageTriggerEvent } from 'aws-lambda';
import { handler } from './handler';

function event(triggerSource: string) {
  return {
    triggerSource,
    request: { codeParameter: '{####}', usernameParameter: null, userAttributes: {} },
    response: { smsMessage: null, emailMessage: null, emailSubject: null },
  } as unknown as CustomMessageTriggerEvent;
}

const run = (e: CustomMessageTriggerEvent) =>
  (handler as unknown as (e: CustomMessageTriggerEvent) => Promise<CustomMessageTriggerEvent>)(e);

describe('custom-message', () => {
  it('新規登録の確認コードを日本語にし、コードの位置を残す', async () => {
    const out = await run(event('CustomMessage_SignUp'));
    expect(out.response.emailSubject).toBe('パワポ作るマンの確認コード');
    expect(out.response.emailMessage).toContain('{####}');
  });

  it('ログインのコードを日本語にし、コードの位置を残す', async () => {
    const out = await run(event('CustomMessage_Authentication'));
    expect(out.response.emailSubject).toBe('パワポ作るマンのログインコード');
    expect(out.response.emailMessage).toContain('{####}');
  });

  it('対象外のメールは既定のまま返す', async () => {
    const out = await run(event('CustomMessage_ForgotPassword'));
    expect(out.response.emailMessage).toBeNull();
  });
});
