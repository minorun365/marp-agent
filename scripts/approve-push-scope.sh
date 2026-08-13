#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "使い方: npm run push:approve -- <今回のコミットSHA>..." >&2
  exit 1
fi

current_branch=$(git branch --show-current)
if [[ "$current_branch" != "main" ]]; then
  echo "この承認は main ブランチ専用です。現在: $current_branch" >&2
  exit 1
fi

git fetch --quiet origin main

remote_sha=$(git rev-parse origin/main)
local_sha=$(git rev-parse HEAD)
outgoing_commits=$(git rev-list --reverse "${remote_sha}..${local_sha}")

if [[ -z "$outgoing_commits" ]]; then
  echo "origin/main へ送るコミットはありません。" >&2
  exit 1
fi

expected_commits=""
for commit in "$@"; do
  full_sha=$(git rev-parse "${commit}^{commit}")
  if [[ -z "$expected_commits" ]]; then
    expected_commits=$full_sha
  else
    expected_commits="${expected_commits}"$'\n'"${full_sha}"
  fi
done

if [[ "$outgoing_commits" != "$expected_commits" ]]; then
  echo "push 対象に、今回明示したもの以外のコミットが含まれています。" >&2
  echo >&2
  git log --oneline "${remote_sha}..${local_sha}" >&2
  echo >&2
  echo "push を中止しました。別セッションのコミットを切り分けてください。" >&2
  exit 1
fi

approval_file=$(git rev-parse --git-path push-scope-approved)
{
  printf '%s\n' "$remote_sha"
  printf '%s\n' "$local_sha"
  printf '%s\n' "$outgoing_commits"
} > "$approval_file"

echo "push 対象を承認しました。"
git log --oneline "${remote_sha}..${local_sha}"
git diff --stat "${remote_sha}..${local_sha}"
