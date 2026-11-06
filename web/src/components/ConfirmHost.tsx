import { useEffect, useRef, useState } from 'react';
import { setConfirmHost } from '../lib/confirm';
import { Button } from './ui';

// The dialog behind askConfirm(). Escape or Cancel answers no.
export default function ConfirmHost() {
  const [question, setQuestion] = useState<{ message: string; action: string } | null>(null);
  const answer = useRef<((yes: boolean) => void) | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setConfirmHost((message, action) => {
      setQuestion({ message, action });
      return new Promise((resolve) => {
        answer.current = resolve;
      });
    });
    return () => setConfirmHost(null);
  }, []);

  function close(yes: boolean) {
    answer.current?.(yes);
    answer.current = null;
    setQuestion(null);
  }

  useEffect(() => {
    if (!question) return;
    // After the menu that opened this has finished handing focus back.
    const focus = setTimeout(() => cancel.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focus);
      document.removeEventListener('keydown', onKey);
    };
  }, [question]);

  if (!question) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] print:hidden">
      <div className="ts-modal max-w-md w-full" role="dialog" aria-modal="true" aria-label="Please confirm">
        <p className="text-sm">{question.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <Button ref={cancel} variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => close(true)}>
            {question.action}
          </Button>
        </div>
      </div>
    </div>
  );
}
