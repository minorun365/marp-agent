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

  // ランダムにTipsを選択する関数（前回と異なるものを選択）
  const getRandomTipIndex = useCallback((currentIndex?: number): number => {
    let newIndex: number;
    do {
      newIndex = Math.floor(Math.random() * TIPS.length);
    } while (TIPS.length > 1 && newIndex === currentIndex);
    return newIndex;
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
            ? { ...msg, tipIndex: getRandomTipIndex() }
            : msg
        )
      );

      // その後5秒ごとにランダムにローテーション
      tipIntervalRef.current = setInterval(() => {
        setMessages(prev =>
          prev.map(msg =>
            msg.isStatus && msg.statusText?.startsWith(MESSAGES.SLIDE_GENERATING_PREFIX)
              ? { ...msg, tipIndex: getRandomTipIndex(msg.tipIndex) }
              : msg
          )
        );
      }, 5000);
    }, 3000);
  }, [getRandomTipIndex, stopTipRotation]);

  return { startTipRotation, stopTipRotation };
}
