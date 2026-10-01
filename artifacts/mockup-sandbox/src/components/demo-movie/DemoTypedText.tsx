import * as React from "react";
import { useDemoMotionEnabled } from "../DemoMotion";

export function useDemoTypedValue(text: string, enabled: boolean) {
  const [revealedText, setRevealedText] = React.useState(enabled ? "" : text);
  const [done, setDone] = React.useState(!enabled);

  React.useEffect(() => {
    if (!enabled || !text) {
      setRevealedText(text);
      setDone(true);
      return;
    }

    setRevealedText("");
    setDone(false);

    let currentCount = 0;
    let timeoutId: number;
    let animationFrameId: number;
    const words = text.split(" ");

    const revealNextWord = () => {
      if (currentCount < words.length) {
        currentCount++;
        const nextString = words.slice(0, currentCount).join(" ");
        setRevealedText(currentCount === words.length ? text : nextString);
        timeoutId = window.setTimeout(() => {
          animationFrameId = requestAnimationFrame(revealNextWord);
        }, 35);
      } else {
        setDone(true);
      }
    };

    animationFrameId = requestAnimationFrame(revealNextWord);

    return () => {
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(animationFrameId);
    };
  }, [text, enabled]);

  return { revealedText, done };
}

export function DemoTypedText({ text, onDone, className }: { text: string; onDone?: () => void; className?: string }) {
  const motionEnabled = useDemoMotionEnabled();
  const { revealedText, done } = useDemoTypedValue(text, motionEnabled);
  
  React.useEffect(() => {
    if (done && onDone) {
      onDone();
    }
  }, [done, onDone]);

  return (
    <span className={className}>
      <span aria-hidden="true">{revealedText}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
