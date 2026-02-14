import { useRef, useEffect, useCallback } from 'react';
import { TIPS, MESSAGES } from '../constants';
import type { Message } from '../types';

interface UseTipRotationReturn {
  startTipRotation: (setMessages: React.Dispatch<React.SetStateAction<Message[]>>) => void;
  stopTipRotation: () => void;
}

export function useTipRotation(): UseTipRotationReturn {
  const tipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shuffledQueueRef = useRef<number[]>([]);

  // コンポーネントアンマウント時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (tipTimeoutRef.current) {
        clearTimeout(tipTimeoutRef.current);
      }
      if (tipIntervalRef.current) {
        clearInterval(tipIntervalRef.current);
      }
    };
  }, []);

  // シャッフルキュー方式でTipsを順番に表示（全メッセージを均等に巡回）
  const getNextTipIndex = useCallback((): number => {
    if (shuffledQueueRef.current.length === 0) {
      shuffledQueueRef.current = Array.from({ length: TIPS.length }, (_, i) => i);
      for (let i = shuffledQueueRef.current.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledQueueRef.current[i], shuffledQueueRef.current[j]] = [shuffledQueueRef.current[j], shuffledQueueRef.current[i]];
      }
    }
    return shuffledQueueRef.current.pop()!;
  }, []);

  const stopTipRotation = useCallback(() => {
    if (tipTimeoutRef.current) {
      clearTimeout(tipTimeoutRef.current);
      tipTimeoutRef.current = null;
    }
    if (tipIntervalRef.current) {
      clearInterval(tipIntervalRef.current);
      tipIntervalRef.current = null;
    }
  }, []);

  const startTipRotation = useCallback((setMessages: React.Dispatch<React.SetStateAction<Message[]>>) => {
    // 既存のタイマーをクリア
    stopTipRotation();

    // 3秒後に最初のTipsを表示
    tipTimeoutRef.current = setTimeout(() => {
      setMessages(prev =>
        prev.map(msg =>
          msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)
            ? { ...msg, tipIndex: getNextTipIndex() }
            : msg
        )
      );

      // その後5秒ごとにシャッフル順でローテーション
      tipIntervalRef.current = setInterval(() => {
        setMessages(prev =>
          prev.map(msg =>
            msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)
              ? { ...msg, tipIndex: getNextTipIndex() }
              : msg
          )
        );
      }, 5000);
    }, 3000);
  }, [getNextTipIndex, stopTipRotation]);

  return { startTipRotation, stopTipRotation };
}
