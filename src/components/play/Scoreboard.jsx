import { displayValue } from '@/lib/play/game/view';
import { taskCells } from '@/lib/play/levels/check';

/**
 * Right column. Per task: numeric answers get one bar per cell (track length
 * ∝ the expected value, filled lime once that cell passes) and a total of the
 * passed values; text answers get one chip per cell, shown as it passes.
 */
export function Scoreboard({ level, results, formats }) {
  return (
    <section aria-labelledby="play-scoreboard-title" className="rounded-[20px] border border-white/10 bg-[#132638] p-5">
      <h2 id="play-scoreboard-title" className="font-en text-sm font-bold uppercase tracking-widest text-[#D4F73F]">
        Scoreboard
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        {level.tasks.map((task) => {
          const cells = taskCells(task).map((ref, i) => {
            const row = ref.replace(/^[A-Z]+/, '');
            return {
              ref,
              expected: task.expected[i],
              label: level.sheet[`A${row}`] ?? ref,
              ok: !!results[ref]?.ok,
            };
          });
          const numeric = cells.every((c) => typeof c.expected === 'number');
          return numeric ? (
            <NumericTask key={task.id} cells={cells} formats={formats} />
          ) : (
            <TextTask key={task.id} cells={cells} />
          );
        })}
      </div>
    </section>
  );
}

function NumericTask({ cells, formats }) {
  const max = Math.max(...cells.map((c) => Math.abs(c.expected)), 0) || 1;
  const total = cells.reduce((s, c) => s + (c.ok ? c.expected : 0), 0);
  const done = cells.filter((c) => c.ok).length;
  const fmt = formats[cells[0].ref];
  return (
    <div>
      <ul className="flex flex-col gap-2">
        {cells.map((c) => (
          <li key={c.ref} className="text-xs">
            <div className="flex justify-between gap-2 text-white/60">
              <span className="truncate">{c.label}</span>
              <span className={`font-en tabular-nums ${c.ok ? 'text-white' : 'text-white/30'}`}>
                {c.ok ? displayValue(c.expected, fmt) : '?'}
              </span>
            </div>
            <div className="mt-1 h-2.5 rounded-full bg-white/5">
              <div
                className="h-full rounded-full border border-white/15"
                style={{ width: `${Math.max(6, (Math.abs(c.expected) / max) * 100)}%` }}
              >
                <div
                  className="h-full rounded-full bg-[#D4F73F] transition-[width] duration-500 ease-9e motion-reduce:transition-none"
                  style={{ width: c.ok ? '100%' : '0%' }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
        <span className="text-xs text-white/50">
          {cells.length > 1 ? `รวม · ผ่าน ${done}/${cells.length}` : cells[0].ref}
        </span>
        <span className="font-en text-3xl font-bold tabular-nums text-white">{displayValue(total, fmt)}</span>
      </p>
    </div>
  );
}

function TextTask({ cells }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {cells.map((c) => (
        <li
          key={c.ref}
          className={`rounded-full px-3 py-1 text-sm transition-opacity duration-300 motion-reduce:transition-none ${
            c.ok ? 'bg-[#D4F73F]/15 text-[#D4F73F] opacity-100' : 'border border-dashed border-white/15 text-white/30'
          }`}
        >
          <span className="text-white/50">{c.label} · </span>
          {c.ok ? c.expected : '?'}
        </li>
      ))}
    </ul>
  );
}
