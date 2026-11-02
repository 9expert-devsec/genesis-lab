'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { checkTask, taskCells } from '@/lib/play/levels/check';
import { hintsForTask } from '@/lib/play/game/hints';
import { loadProgress, progressReducer, saveProgress, totalStars } from '@/lib/play/game/progress';
import { maxStarsFor, starsFor, xpFor } from '@/lib/play/game/stars';
import { failureMessage, formatMap, formulaRefSpans, gridBounds, levelFunctions, secretFormulas } from '@/lib/play/game/view';
import { displayFormula } from '@/lib/play/game/normalize';
import { isChapterUnlocked } from '@/lib/play/game/map';

import { PlayHud } from './PlayHud';
import { MissionPanel } from './MissionPanel';
import { FormulaBar, QuickKeys } from './FormulaBar';
import { SheetGrid, SheetLegend } from './SheetGrid';
import { Scoreboard } from './Scoreboard';
import { AlmostThereDialog, MissionCompleteDialog } from './ResultDialog';

const CELL_STEP_MS = 180;
const EXCEL_COURSES_HREF = '/excel-all-courses';

// Space backdrop: a soft glow plus two tiling star layers. Always dark — the
// play pages ignore the site's light/dark toggle.
const SPACE_BG = {
  backgroundColor: '#0D1B2A',
  backgroundImage: [
    'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(72,176,255,0.18), transparent 70%)',
    'radial-gradient(1px 1px at 24px 36px, rgba(255,255,255,0.55), transparent)',
    'radial-gradient(1px 1px at 132px 92px, rgba(255,255,255,0.35), transparent)',
    'radial-gradient(1.5px 1.5px at 210px 168px, rgba(212,247,63,0.45), transparent)',
    'radial-gradient(1px 1px at 76px 204px, rgba(255,255,255,0.4), transparent)',
  ].join(','),
  backgroundSize: '100% 100%, 240px 240px, 240px 240px, 240px 240px, 240px 240px',
};

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function PlayLevel({ level, chapterName, levels, nextLevelId }) {
  const inputRef = useRef(null);
  const timers = useRef([]);

  const [taskIndex, setTaskIndex] = useState(0);
  const [formula, setFormula] = useState('');
  const [filled, setFilled] = useState({}); // values of tasks already passed
  const [results, setResults] = useState({}); // ref → { value, ok } shown on the grid
  const [running, setRunning] = useState(false);
  const [hintsShown, setHintsShown] = useState(() => level.tasks.map(() => 0));
  const [passedFormulas, setPassedFormulas] = useState([]);
  const [complete, setComplete] = useState(false);
  const [dialog, setDialog] = useState(null); // null | { kind: 'fail', message } | { kind: 'complete' }
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState({});

  // Storage is read after mount so the server HTML and first client render agree.
  useEffect(() => setProgress(loadProgress()), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const task = level.tasks[taskIndex];
  const hints = useMemo(() => hintsForTask(task), [task]);
  const hintsUsed = hintsShown.reduce((s, n) => s + n, 0);
  const stars = starsFor(hintsUsed);

  const { cols, rows } = useMemo(() => gridBounds(level), [level]);
  const formats = useMemo(() => formatMap(level), [level]);
  const functions = useMemo(() => levelFunctions(level), [level]);
  const answers = useMemo(() => {
    const out = {};
    for (const t of level.tasks) taskCells(t).forEach((ref, i) => (out[ref] = t.expected[i]));
    return out;
  }, [level]);
  const activeCells = useMemo(() => taskCells(task), [task]);
  const { spans, cells: refCells } = useMemo(() => formulaRefSpans(formula), [formula]);

  const chapterLevels = levels.filter((l) => l.chapter === level.chapter).sort((a, b) => a.order - b.order);
  const starsTotal = totalStars(progress, levels);
  const starsMax = maxStarsFor(levels);
  const nextHref = nextLevelId ? `/play/excel/beginner/${nextLevelId}` : '/play';
  const nextLabel = nextLevelId ? 'ด่านถัดไป →' : 'กลับแผนที่';

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const insertAtCaret = useCallback(
    (text) => {
      const el = inputRef.current;
      const start = el?.selectionStart ?? formula.length;
      const end = el?.selectionEnd ?? formula.length;
      // A ref or function typed into an empty box starts the formula for them.
      const lead = formula === '' && text !== '=' ? '=' : '';
      const next = formula.slice(0, start) + lead + text + formula.slice(end);
      const caret = start + lead.length + text.length;
      setFormula(next);
      requestAnimationFrame(() => {
        if (!inputRef.current) return;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(caret, caret);
      });
    },
    [formula],
  );

  function onCellMouseDown(e, ref) {
    if (complete || running) return;
    if (document.activeElement !== inputRef.current) return;
    e.preventDefault(); // keep focus and caret in the input
    insertAtCaret(ref);
  }

  function clearTaskResults(cells) {
    setResults((prev) => {
      const next = { ...prev };
      for (const ref of cells) delete next[ref];
      return next;
    });
  }

  function finish(result, typed) {
    setRunning(false);
    if (!result.pass) {
      setDialog({ kind: 'fail', message: failureMessage(result, typed, task) });
      return;
    }
    const values = Object.fromEntries(result.cells.map((c) => [c.ref, c.value]));
    setFilled((prev) => ({ ...prev, ...values }));
    setPassedFormulas((prev) => {
      const next = [...prev];
      next[taskIndex] = typed;
      return next;
    });
    if (taskIndex < level.tasks.length - 1) {
      setTaskIndex(taskIndex + 1);
      setFormula('');
      setNotice(`ผ่านขั้นที่ ${taskIndex + 1} แล้ว! ต่อขั้นที่ ${taskIndex + 2}`);
      focusInput();
      return;
    }
    setComplete(true);
    setProgress((prev) => {
      const next = progressReducer(prev, { type: 'pass', levelId: level.id, stars });
      saveProgress(next);
      return next;
    });
    setDialog({ kind: 'complete' });
  }

  function run() {
    if (running || complete) return;
    // Excel's own Enter behaviour: `=b2+c2` becomes `=B2+C2` in the box, and
    // that form is what is checked and quoted back in ALMOST THERE.
    const typed = displayFormula(formula);
    if (!typed) {
      focusInput();
      return;
    }
    if (typed !== formula) setFormula(typed);
    setNotice('');
    const result = checkTask(level, task.id, typed, filled);
    clearTaskResults(activeCells);
    if (result.cells.length === 0) {
      finish(result, typed);
      return;
    }
    setRunning(true);
    const step = prefersReducedMotion() ? 0 : CELL_STEP_MS;
    timers.current.forEach(clearTimeout);
    timers.current = result.cells.map((c, i) =>
      setTimeout(() => {
        setResults((prev) => ({ ...prev, [c.ref]: { value: c.value, ok: c.ok } }));
        if (i === result.cells.length - 1) finish(result, typed);
      }, step * (i + 1)),
    );
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    setRunning(false);
    setFormula('');
    setDialog(null);
    if (!complete) clearTaskResults(activeCells);
    focusInput();
  }

  function revealHint() {
    setHintsShown((prev) => {
      const next = [...prev];
      next[taskIndex] = Math.min(hints.length, next[taskIndex] + 1);
      return next;
    });
  }

  const secrets = complete
    ? level.tasks.flatMap((t, i) =>
        secretFormulas(t, passedFormulas[i]).map((f) => ({ anchor: level.tasks.length > 1 ? t.anchor : null, formula: f })),
      )
    : [];

  return (
    <div style={SPACE_BG} className="min-h-[calc(100dvh-80px)] text-white">
      <PlayHud
        level={level}
        chapterName={chapterName}
        chapterLevels={chapterLevels}
        chapterUnlocked={isChapterUnlocked(level.chapter, levels, progress)}
        progress={progress}
        starsTotal={starsTotal}
        starsMax={starsMax}
      />

      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 md:grid-cols-[280px_minmax(0,1fr)] md:px-6 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        <MissionPanel
          level={level}
          taskIndex={taskIndex}
          complete={complete}
          hints={hints}
          hintsShown={hintsShown[taskIndex]}
          stars={stars}
          onHint={revealHint}
          nextHref={nextHref}
          nextLabel={nextLabel}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <FormulaBar
            inputRef={inputRef}
            anchor={task.anchor}
            value={formula}
            spans={spans}
            disabled={complete}
            running={running}
            onChange={(v) => setFormula(v)}
            onRun={run}
            onReset={reset}
          />
          <p className="min-h-[1.25rem] text-sm text-[#86EFAC]" role="status" aria-live="polite">
            {notice}
          </p>
          <SheetGrid
            cols={cols}
            rows={rows}
            sheet={level.sheet}
            formats={formats}
            answers={answers}
            results={results}
            activeCells={complete ? [] : activeCells}
            anchor={complete ? null : task.anchor}
            refCells={refCells}
            onCellMouseDown={onCellMouseDown}
          />
          <SheetLegend />
          <QuickKeys functions={functions} disabled={complete} onInsert={insertAtCaret} />
          <p className="text-xs text-white/40">
            เคล็ดลับ: ขณะพิมพ์สูตร คลิกช่องในตารางเพื่อใส่ชื่อช่อง (เช่น B2) ลงในสูตรได้เลย
          </p>
        </div>

        <div className="md:col-span-2 xl:col-span-1">
          <Scoreboard level={level} results={results} formats={formats} />
        </div>
      </div>

      {dialog?.kind === 'fail' && (
        <AlmostThereDialog
          message={dialog.message}
          canHint={hintsShown[taskIndex] < hints.length}
          onRetry={() => {
            setDialog(null);
            requestAnimationFrame(() => inputRef.current?.select());
          }}
          onHint={() => {
            revealHint();
            setDialog(null);
            focusInput();
          }}
        />
      )}
      {dialog?.kind === 'complete' && (
        <MissionCompleteDialog
          level={level}
          stars={stars}
          xp={xpFor(stars)}
          secrets={secrets}
          nextHref={nextHref}
          nextLabel={nextLabel}
          coursesHref={EXCEL_COURSES_HREF}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
