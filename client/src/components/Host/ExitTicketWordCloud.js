import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Cloud } from 'lucide-react';
import {
  WORD_CLOUD_MAX_ITEMS,
  buildExitTicketWordCloudItems,
  capWordCloudItems,
  getResponseAnswerAt,
  normalizeExitTicketQuestionType,
  resolveExitTicketAnswerLabel,
} from '../../utils/exitTicketWordCloud';
import {
  CLOUD_FONT_STACK,
  WORD_CLOUD_BG,
  bulbMetrics,
  buildBulbCloudLists,
  clipCanvasToBulb,
  cloudListSeed,
  installSeededRandom,
  paintBulbOccupancyMask,
} from '../../utils/exitTicketBulbLayout';

const typeLabel = (type) => {
  switch (normalizeExitTicketQuestionType(type)) {
    case 'multiple_choice':
      return 'Multiple Choice';
    case 'likert':
      return 'Likert Scale';
    case 'true_false':
      return 'True / False';
    default:
      return 'Short Text';
  }
};

const isChoiceType = (type) => {
  const t = normalizeExitTicketQuestionType(type);
  return t === 'multiple_choice' || t === 'likert' || t === 'true_false';
};

function collectAnswerTexts(responses, questionIndex, question) {
  return (responses || [])
    .map((row) => resolveExitTicketAnswerLabel(getResponseAnswerAt(row, questionIndex), question))
    .filter((text) => String(text).trim() !== '');
}

export function ExitTicketShortTextModeChips({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {[
        { id: 'words', label: 'Each word' },
        { id: 'phrases', label: 'Whole answer' },
      ].map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`min-h-11 md:min-h-[30px] h-auto md:h-[30px] px-3 rounded-full text-xs border transition-colors ${
              active
                ? 'bg-white text-[#4A1F3D] border-white font-medium'
                : 'bg-transparent text-white/80 border-white/35'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExitTicketPresentButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 rounded-lg border border-[#6B3A5C] text-[#4A1F3D] bg-white hover:bg-[#F1E4EC] transition-colors text-sm font-medium"
      aria-label="Word Cloud"
    >
      <Cloud className="w-4 h-4 shrink-0" />
      <span>Word Cloud</span>
    </button>
  );
}

function BulbWordCloud({ items, extra, empty }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 40 && rect.height >= 40) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (empty || !canvas || size.width < 40 || size.height < 40) {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setTooltip(null);
      return undefined;
    }

    let cancelled = false;
    let timer = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = size.width;
    const cssH = size.height;
    const cw = Math.max(1, Math.round(cssW * dpr));
    const ch = Math.max(1, Math.round(cssH * dpr));

    const runCloud = (WordCloud, list, options) =>
      new Promise((resolve) => {
        if (!list.length) {
          resolve();
          return;
        }
        const onStop = () => {
          canvas.removeEventListener('wordcloudstop', onStop);
          resolve();
        };
        canvas.addEventListener('wordcloudstop', onStop);
        WordCloud(canvas, {
          fontFamily: CLOUD_FONT_STACK,
          backgroundColor: WORD_CLOUD_BG,
          clearCanvas: false,
          minSize: 6,
          drawOutOfBound: false,
          shrinkToFit: true,
          minRotation: 0,
          maxRotation: Math.PI / 2,
          rotationSteps: 2,
          shuffle: true,
          shape: 'circle',
          ellipticity: 0.95,
          wait: 0,
          list: list.map((row) => row.slice()),
          ...options,
        });
      });

    const drawBulbCloud = async () => {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      const WordCloud = require('wordcloud');
      if (!ctx || !WordCloud?.isSupported) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintBulbOccupancyMask(ctx, cw, ch, WORD_CLOUD_BG);

      const { realList, fillerList, realCount } = buildBulbCloudLists(items);
      const seed = cloudListSeed(items);
      const metrics = bulbMetrics(cw, ch);
      const maxFont = Math.max(28 * dpr, Math.min(metrics.R * 0.55, 96 * dpr));
      const gridSize = Math.max(4, Math.min(6, Math.round(4 * dpr)));
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const restoreRandom = installSeededRandom(seed);
      canvas._restoreRandom = restoreRandom;

      const shared = {
        gridSize,
        origin: [metrics.cx, metrics.cy],
        weightFactor: (weight) => (Number(weight) / 100) * maxFont,
        color: (word, weight, fontSize, distance, theta, extra) => {
          const meta = extra && extra[0];
          return meta?.color || '#FFFFFF';
        },
      };

      const realHits = [];
      const origFill = ctx.fillText.bind(ctx);
      const countByLabel = new Map(realList.map((row) => [row[0], row[2].count]));
      ctx.fillText = function fillTextTracked(text, x, y) {
        const count = countByLabel.get(text);
        if (count != null && typeof ctx.getTransform === 'function') {
          const tr = ctx.getTransform();
          const w = ctx.measureText(text).width;
          const fs = parseFloat(ctx.font) || 16;
          const corners = [
            new DOMPoint(x, y - fs / 2),
            new DOMPoint(x + w, y - fs / 2),
            new DOMPoint(x, y + fs / 2),
            new DOMPoint(x + w, y + fs / 2),
          ].map((pt) => pt.matrixTransform(tr));
          const xs = corners.map((p) => p.x);
          const ys = corners.map((p) => p.y);
          realHits.push({
            text,
            count,
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
          });
        }
        return origFill(text, x, y);
      };

      await runCloud(WordCloud, realList, {
        ...shared,
        fontWeight: '700',
        rotateRatio: realCount >= 12 && !reduceMotion ? 0.3 : 0,
      });
      ctx.fillText = origFill;
      if (cancelled) {
        restoreRandom();
        return;
      }
      await runCloud(WordCloud, fillerList, {
        ...shared,
        fontWeight: '500',
        rotateRatio: reduceMotion ? 0 : 0.3,
      });
      restoreRandom();
      if (cancelled) return;
      clipCanvasToBulb(ctx, cw, ch);
      canvas._realHits = realHits;
    };

    const run = async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // system fonts
        }
      }
      if (cancelled) return;
      await drawBulbCloud();
    };

    timer = window.setTimeout(run, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (typeof canvas._restoreRandom === 'function') {
        canvas._restoreRandom();
        canvas._restoreRandom = null;
      }
      try {
        const WordCloud = require('wordcloud');
        if (typeof WordCloud?.stop === 'function') WordCloud.stop();
      } catch {
        // library not used in this pass
      }
    };
  }, [items, size.width, size.height, empty]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full min-h-[240px] max-h-[80vh] overflow-x-hidden"
    >
      {empty ? (
        <p className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/85 px-6">
          No responses yet. The cloud will appear as answers come in.
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block"
          role="img"
          aria-label="Word cloud"
          onMouseMove={(event) => {
            const hits = canvasRef.current?._realHits;
            if (!hits?.length) {
              setTooltip(null);
              return;
            }
            const rect = canvasRef.current.getBoundingClientRect();
            const scaleX = canvasRef.current.width / rect.width;
            const scaleY = canvasRef.current.height / rect.height;
            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;
            const hit = hits.find(
              (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
            );
            if (hit) {
              setTooltip({
                text: `${hit.text}: ${hit.count} response${hit.count === 1 ? '' : 's'}`,
                x: event.clientX,
                y: event.clientY,
              });
            } else {
              setTooltip(null);
            }
          }}
          onMouseLeave={() => setTooltip(null)}
          onClick={(event) => {
            event.currentTarget.dispatchEvent(
              new MouseEvent('mousemove', {
                clientX: event.clientX,
                clientY: event.clientY,
                bubbles: true,
              })
            );
          }}
        />
      )}
      {tooltip ? (
        <div
          className="pointer-events-none fixed z-[90] px-2 py-1 rounded bg-black/80 text-white text-xs max-w-[240px] whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.text}
        </div>
      ) : null}
      {!empty && extra > 0 ? (
        <p className="absolute bottom-1 left-0 right-0 text-center text-[11px] text-white/70">
          +{extra} more
        </p>
      ) : null}
    </div>
  );
}

export function ExitTicketWordCloudPresent({
  open,
  onClose,
  questionIndex,
  questionCount,
  onPrev,
  onNext,
  question,
  items,
  extra,
  responseCount,
  shortTextMode,
  onShortTextModeChange,
}) {
  const rootRef = useRef(null);
  const usedFsRef = useRef(false);
  const [overlayOnly, setOverlayOnly] = useState(false);
  const showChips = !isChoiceType(question?.type);

  useEffect(() => {
    if (!open) return undefined;
    usedFsRef.current = false;
    const start = async () => {
      const el = rootRef.current;
      try {
        if (el?.requestFullscreen) {
          await el.requestFullscreen();
          usedFsRef.current = true;
          setOverlayOnly(false);
          return;
        }
      } catch {
        // overlay fallback
      }
      setOverlayOnly(true);
    };
    start();
    const onFs = () => {
      if (usedFsRef.current && !document.fullscreenElement) {
        onClose();
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'ArrowLeft') onPrev();
      if (event.key === 'ArrowRight') onNext();
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, onPrev, onNext]);

  useEffect(() => {
    if (open) return undefined;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    return undefined;
  }, [open]);

  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={`${
        overlayOnly ? 'fixed inset-0 z-[80]' : ''
      } bg-[#4A1F3D] text-white w-full h-full min-h-screen flex flex-col p-4 sm:p-6 overflow-x-hidden`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm sm:text-base font-medium">
            Q{questionIndex + 1} · {typeLabel(question?.type)}
          </p>
          <p className="mt-1 text-xs sm:text-sm text-white/80 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            Live · {responseCount} responses
          </p>
        </div>
        <button
          type="button"
          onClick={handleExit}
          className="min-h-11 px-5 py-2 rounded-lg bg-white text-[#4A1F3D] font-medium text-sm shrink-0"
        >
          Exit
        </button>
      </div>
      {showChips ? (
        <div className="mt-3">
          <ExitTicketShortTextModeChips value={shortTextMode} onChange={onShortTextModeChange} />
        </div>
      ) : null}
      <div className="flex-1 flex items-stretch justify-center min-h-0 w-full">
        <BulbWordCloud items={items} extra={extra} empty={!items.length} />
      </div>
      {questionCount > 1 ? (
        <div className="flex items-center justify-center gap-4 pb-2">
          <button
            type="button"
            onClick={onPrev}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
            aria-label="Previous question"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
            aria-label="Next question"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function useExitTicketCloudItems(responses, questionIndex, question, shortTextMode) {
  return useMemo(() => {
    const texts = collectAnswerTexts(responses, questionIndex, question);
    const choice = isChoiceType(question?.type);
    const mode = choice ? 'phrases' : shortTextMode === 'phrases' ? 'phrases' : 'words';
    const built = buildExitTicketWordCloudItems({ texts, mode });
    return capWordCloudItems(built, WORD_CLOUD_MAX_ITEMS);
  }, [responses, questionIndex, question, shortTextMode]);
}

export { isChoiceType, typeLabel, collectAnswerTexts };
