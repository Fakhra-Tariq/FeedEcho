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
  WORD_CLOUD_SHAPE_FILL,
  brainMetrics,
  buildBulbCloudLists,
  clipCanvasToBrain,
  cloudListSeed,
  countGlyphsOutsideBrain,
  fitBrainBox,
  installSeededRandom,
  paintBrainOccupancyMask,
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

function logCloud(stage, detail) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[word-cloud]', stage, detail || '');
  }
}

function BrainWordCloud({ items, extra, empty }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    let debounce = 0;
    const apply = () => {
      const pw = el.clientWidth || el.getBoundingClientRect().width;
      const ph = el.clientHeight || el.getBoundingClientRect().height;
      if (pw < 40 || ph < 40) return;
      const next = fitBrainBox(pw, ph, {
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      });
      if (next.width < 40 || next.height < 40) return;
      setSize((prev) => {
        if (Math.abs(prev.width - next.width) < 2 && Math.abs(prev.height - next.height) < 2) {
          return prev;
        }
        return { width: next.width, height: next.height };
      });
    };
    const schedule = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(apply, 150);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    document.addEventListener('fullscreenchange', schedule);
    return () => {
      window.clearTimeout(debounce);
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      document.removeEventListener('fullscreenchange', schedule);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (empty) {
      setTooltip(null);
      return undefined;
    }
    if (!canvas || size.width < 40 || size.height < 40) return undefined;

    const myId = (renderIdRef.current += 1);
    let timer = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = size.width;
    const cssH = size.height;
    const cw = Math.max(1, Math.round(cssW * dpr));
    const ch = Math.max(1, Math.round(cssH * dpr));
    const stillCurrent = () => myId === renderIdRef.current;
    logCloud('start', { cssW, cssH, cw, ch, items: (items || []).length, myId });

    const runCloud = (WordCloud, list, options, timeoutMs) =>
      new Promise((resolve) => {
        if (!list.length) {
          resolve({ drawn: 0, timedOut: false });
          return;
        }
        let drawn = 0;
        let timedOut = false;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(kill);
          canvas.removeEventListener('wordcloudstop', finish);
          canvas.removeEventListener('wordcloudabort', finish);
          canvas.removeEventListener('wordclouddrawn', onDrawn);
          resolve({ drawn, timedOut });
        };
        const onDrawn = (event) => {
          if (event?.detail?.drawn) drawn += 1;
        };
        const kill = window.setTimeout(() => {
          timedOut = true;
          logCloud('timeout', { timeoutMs, drawn });
          try {
            WordCloud.stop();
          } catch {
            // ignore
          }
          finish();
        }, timeoutMs);
        canvas.addEventListener('wordcloudstop', finish);
        canvas.addEventListener('wordcloudabort', finish);
        canvas.addEventListener('wordclouddrawn', onDrawn);
        logCloud('library-start', { n: list.length, shrinkToFit: options.shrinkToFit });
        WordCloud(canvas, {
          fontFamily: CLOUD_FONT_STACK,
          backgroundColor: WORD_CLOUD_SHAPE_FILL,
          clearCanvas: false,
          minSize: options.minSize,
          drawOutOfBound: false,
          minRotation: 0,
          maxRotation: Math.PI / 2,
          rotationSteps: 2,
          shuffle: true,
          shape: 'square',
          ellipticity: 1,
          wait: 0,
          list: list.map((row) => row.slice()),
          ...options,
        });
      });

    const drawFallbackReals = (ctx, realList, maxFont) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintBrainOccupancyMask(ctx, cw, ch);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const gap = 16;
      const totalH = realList.length * (maxFont / dpr) * 0.7;
      let y = cssH / 2 - totalH / 2;
      realList.forEach((row, i) => {
        const fontPx = Math.max(18, (row[1] / 100) * (maxFont / dpr));
        ctx.font = `700 ${fontPx}px ${CLOUD_FONT_STACK}`;
        ctx.fillStyle = row[2]?.color || '#FFFFFF';
        ctx.fillText(row[0], cssW / 2, y + fontPx / 2);
        y += fontPx + gap;
      });
      logCloud('fallback-reals', { n: realList.length });
    };

    const drawBrainCloud = async (fillerScale) => {
      const WordCloud = require('wordcloud');
      const ctx = canvas.getContext('2d');
      if (!ctx || !WordCloud?.isSupported) return 0;
      const sizeChanged = canvas.width !== cw || canvas.height !== ch;
      if (sizeChanged) {
        canvas.width = cw;
        canvas.height = ch;
      }
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.style.backgroundColor = WORD_CLOUD_BG;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintBrainOccupancyMask(ctx, cw, ch);
      logCloud('mask-built', { fillerScale, sizeChanged });

      const { realList, fillerList, realCount } = buildBulbCloudLists(items, {
        width: cssW,
        height: cssH,
        fillerScale,
      });
      logCloud('lists', { real: realList.length, filler: fillerList.length });
      const seed = cloudListSeed(items);
      const metrics = brainMetrics(cw, ch);
      const phone = Math.min(window.innerWidth, cssW) < 640;
      const drawnHcss = metrics.drawnH / dpr;
      const maxFontCss = phone
        ? Math.min(38, Math.max(22, drawnHcss * 0.16))
        : Math.min(90, Math.max(64, drawnHcss * 0.11));
      const minFontCss = phone ? 11 : 14;
      const maxFont = maxFontCss * dpr;
      const minSize = minFontCss * dpr;
      const gridSize = Math.max(2, Math.min(4, Math.round(3 * dpr)));
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const restoreRandom = installSeededRandom(seed);
      canvas._restoreRandom = restoreRandom;

      const shared = {
        gridSize,
        minSize,
        origin: [metrics.cx, metrics.cy],
        weightFactor: (weight) => (Number(weight) / 100) * maxFont,
        color: (word, weight, fontSize, distance, theta, extra) => {
          const meta = extra && extra[0];
          return meta?.color || '#FFFFFF';
        },
      };

      const realHits = [];
      const allHits = [];
      const origFill = ctx.fillText.bind(ctx);
      const countByLabel = new Map(realList.map((row) => [row[0], row[2].count]));
      ctx.fillText = function fillTextTracked(text, x, y) {
        if (typeof ctx.getTransform === 'function') {
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
          const box = {
            text,
            count: countByLabel.get(text),
            left: Math.min(...xs),
            right: Math.max(...xs),
            top: Math.min(...ys),
            bottom: Math.max(...ys),
          };
          allHits.push(box);
          if (box.count != null) realHits.push(box);
        }
        return origFill(text, x, y);
      };

      let drawn = 0;
      let timedOut = false;
      try {
        const reals = await runCloud(
          WordCloud,
          realList,
          {
            ...shared,
            fontWeight: '700',
            shrinkToFit: true,
            rotateRatio: realCount >= 12 && !reduceMotion ? 0.3 : 0,
          },
          3000
        );
        drawn += reals.drawn;
        timedOut = timedOut || reals.timedOut;
        logCloud('reals-stop', { drawn, timedOut: reals.timedOut });
        const fillers = await runCloud(
          WordCloud,
          fillerList,
          {
            ...shared,
            fontWeight: '500',
            shrinkToFit: false,
            rotateRatio: reduceMotion ? 0 : 0.3,
          },
          3000
        );
        drawn += fillers.drawn;
        timedOut = timedOut || fillers.timedOut;
        logCloud('filler-stop', { drawn, timedOut: fillers.timedOut });
      } finally {
        ctx.fillText = origFill;
        restoreRandom();
        canvas._restoreRandom = null;
        if (drawn > 0) {
          clipCanvasToBrain(ctx, cw, ch);
          logCloud('clipped', {
            drawn,
            outside: countGlyphsOutsideBrain(allHits, cw, ch),
          });
        }
      }
      canvas._realHits = realHits;
      canvas._allHits = allHits;
      return drawn;
    };

    const run = async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // system fonts
        }
      }
      logCloud('fonts-ready', { current: stillCurrent() });
      if (!stillCurrent()) return;
      try {
        let drawn = await drawBrainCloud(1);
        if (!stillCurrent()) return;
        if ((!drawn || drawn < 1) && (items || []).length) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[word-cloud] zero words; retry half filler');
          }
          drawn = await drawBrainCloud(0.5);
        }
        if (!stillCurrent()) return;
        if (!drawn && (items || []).length) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[word-cloud] still zero words; fallback real labels');
          }
          const ctx = canvas.getContext('2d');
          const { realList } = buildBulbCloudLists(items, { width: cssW, height: cssH });
          const metrics = brainMetrics(cw, ch);
          const phone = Math.min(window.innerWidth, cssW) < 640;
          const drawnHcss = metrics.drawnH / dpr;
          const maxFontCss = phone
            ? Math.min(38, Math.max(22, drawnHcss * 0.16))
            : Math.min(90, Math.max(64, drawnHcss * 0.11));
          const maxFont = maxFontCss * dpr;
          if (ctx) {
            drawFallbackReals(ctx, realList, maxFont);
            clipCanvasToBrain(ctx, cw, ch);
          }
        }
      } catch (err) {
        logCloud('error', String(err && err.message));
        if (process.env.NODE_ENV === 'development') {
          console.warn('[word-cloud] render failed; keeping canvas', err);
        }
      }
    };

    timer = window.setTimeout(run, 300);
    return () => {
      renderIdRef.current += 1;
      window.clearTimeout(timer);
      if (typeof canvas._restoreRandom === 'function') {
        canvas._restoreRandom();
        canvas._restoreRandom = null;
      }
      try {
        const WordCloud = require('wordcloud');
        if (typeof WordCloud?.stop === 'function') WordCloud.stop();
      } catch {
        // ignore
      }
    };
  }, [items, size.width, size.height, empty]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full min-h-0 overflow-hidden flex items-center justify-center"
    >
      {empty ? (
        <p className="absolute inset-0 flex items-center justify-center text-center text-sm text-white/85 px-6">
          No responses yet. The cloud will appear as answers come in.
        </p>
      ) : (
        <div
          className="relative max-w-full max-h-full"
          style={{
            width: size.width ? `${size.width}px` : '100%',
            height: size.height ? `${size.height}px` : '100%',
          }}
        >
          <canvas
            ref={canvasRef}
            className="block bg-[#4A1F3D]"
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
          {extra > 0 ? (
            <p className="absolute bottom-1 left-0 right-0 text-center text-[11px] text-white/70 pointer-events-none">
              +{extra} more
            </p>
          ) : null}
        </div>
      )}
      {tooltip ? (
        <div
          className="pointer-events-none fixed z-[90] px-2 py-1 rounded bg-black/80 text-white text-xs max-w-[240px] whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.text}
        </div>
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
          return;
        }
      } catch {
        // iPhone / denied Fullscreen API: fixed inset overlay still covers the viewport
      }
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
      className="fixed inset-0 z-[80] bg-[#4A1F3D] text-white w-full h-full min-h-screen flex flex-col px-6 py-4 sm:p-6 overflow-x-hidden overflow-y-hidden"
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
      <div className="flex-1 flex items-center justify-center min-h-0 w-full h-full">
        <BrainWordCloud items={items} extra={extra} empty={!items.length} />
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
