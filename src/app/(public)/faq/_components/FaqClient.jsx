'use client';

import { useMemo, useState } from 'react';
import { Search, ChevronDown, HelpCircle } from 'lucide-react';

const ALL = '__ALL__';

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-semibold text-[#0D1B2A]">{item.question}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#005CFF] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      <div
        className={`grid transition-all duration-200 ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-gray-100 px-5 py-4 text-sm leading-relaxed text-gray-600">
            {item.answer_html ? (
              <div
                className="whitespace-pre-line"
                dangerouslySetInnerHTML={{ __html: item.answer_html }}
              />
            ) : (
              <p className="whitespace-pre-line">{item.answer_plain || ''}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategorySection({ category, items, openId, setOpenId }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3 border-l-4 border-[#005CFF] pl-3">
        <h2 className="text-lg font-bold text-[#0D1B2A]">{category}</h2>
        <span className="text-xs text-gray-500">{items.length} คำถาม</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <FaqItem
            key={item.faq_id}
            item={item}
            isOpen={openId === item.faq_id}
            onToggle={() =>
              setOpenId((cur) => (cur === item.faq_id ? null : item.faq_id))
            }
          />
        ))}
      </div>
    </section>
  );
}

export function FaqClient({ groups }) {
  const categories = useMemo(() => Object.keys(groups), [groups]);
  const totalCount = useMemo(
    () => categories.reduce((sum, c) => sum + groups[c].length, 0),
    [groups, categories]
  );

  const [activeCategory, setActiveCategory] = useState(
    categories[0] ?? ALL
  );
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const trimmedQuery = query.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;

  // When searching, ignore tabs and return ALL matching items across categories,
  // re-grouped so the section headers still make sense.
  const visibleGroups = useMemo(() => {
    if (searching) {
      const out = {};
      for (const cat of categories) {
        const matches = groups[cat].filter((it) =>
          (it.question ?? '').toLowerCase().includes(trimmedQuery)
        );
        if (matches.length) out[cat] = matches;
      }
      return out;
    }
    if (activeCategory === ALL) return groups;
    return groups[activeCategory]
      ? { [activeCategory]: groups[activeCategory] }
      : {};
  }, [searching, trimmedQuery, activeCategory, groups, categories]);

  const visibleCategoryKeys = Object.keys(visibleGroups);
  const noResults = searching && visibleCategoryKeys.length === 0;

  if (totalCount === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-gray-500">
        ยังไม่มีข้อมูลคำถาม กรุณาลองใหม่อีกครั้ง
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16">
      <div className="mx-auto -mt-8 max-w-3xl">
        <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100">
          <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาคำถาม..."
            className="w-full bg-transparent text-sm text-[#0D1B2A] placeholder:text-gray-400 focus:outline-none"
            aria-label="ค้นหาคำถาม"
          />
        </div>
      </div>

      {!searching && categories.length > 1 && (
        <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => {
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setActiveCategory(cat);
                  setOpenId(null);
                }}
                className={
                  'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'bg-[#005CFF] text-white shadow-sm'
                    : 'border border-gray-200 bg-white text-[#0D1B2A] hover:border-[#005CFF]/40')
                }
              >
                <span>{cat}</span>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-xs ' +
                    (active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600')
                  }
                >
                  {groups[cat].length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-8 space-y-10">
        {noResults && (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-gray-500">
            <HelpCircle className="h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="text-sm">ไม่พบคำถามที่ตรงกัน</p>
          </div>
        )}

        {visibleCategoryKeys.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            items={visibleGroups[cat]}
            openId={openId}
            setOpenId={setOpenId}
          />
        ))}
      </div>
    </div>
  );
}