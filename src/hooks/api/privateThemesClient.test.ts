import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAuthSession } from 'aws-amplify/auth';
import { fetchPrivateThemes, isOwner } from './privateThemesClient';

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn() }));

describe('privateThemesClient', () => {
  beforeEach(() => {
    vi.mocked(fetchAuthSession).mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('owner グループのときだけ運営者とみなす', () => {
    expect(isOwner(['owner'])).toBe(true);
    expect(isOwner(['users'])).toBe(false);
    expect(isOwner(undefined)).toBe(false);
  });

  it('owner でなければエージェントを呼ばずに空を返す', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: { accessToken: { payload: {}, toString: () => 'token' } },
    } as never);

    await expect(fetchPrivateThemes()).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
