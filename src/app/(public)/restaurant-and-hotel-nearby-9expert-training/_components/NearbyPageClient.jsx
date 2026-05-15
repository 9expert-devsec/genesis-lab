'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Coffee,
  Droplets,
  ExternalLink,
  Hotel,
  ListFilter,
  MapPin,
  Navigation,
  Phone,
  Route,
  Search,
  Utensils,
  Wine,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────

const filters = [
  { key: 'all',   label: 'ทั้งหมด',      icon: ListFilter },
  { key: 'hotel', label: 'โรงแรม',        icon: Hotel },
  { key: 'food',  label: 'ร้านอาหาร',    icon: Utensils },
  { key: 'cafe',  label: 'ร้านกาแฟ',     icon: Coffee },
  { key: 'bar',   label: 'ผับ/ร้านอาหาร', icon: Wine },
  { key: 'drink', label: 'เครื่องดื่ม',  icon: Droplets },
];

const badgeClassNames = {
  hotel: 'bg-sky-50 text-sky-700 border-sky-100',
  food:  'bg-orange-50 text-orange-700 border-orange-100',
  cafe:  'bg-amber-50 text-amber-700 border-amber-100',
  bar:   'bg-violet-50 text-violet-700 border-violet-100',
  drink: 'bg-cyan-50 text-cyan-700 border-cyan-100',
};

const mapPositions = [
  [58, 32], [38, 38], [66, 48], [34, 58],
  [58, 67], [46, 25], [72, 37], [27, 46],
];

// ── Sub-components ─────────────────────────────────────────────────

function PlaceCard({ place }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-44 overflow-hidden bg-slate-100">
        <img
          src={place.image_url}
          alt={place.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span className={`absolute left-3 top-3 rounded-full border px-3 py-1 text-xs font-bold ${badgeClassNames[place.type] ?? 'border-slate-100 bg-slate-50 text-slate-700'}`}>
          {place.label}
        </span>
      </div>

      <div className="p-5">
        <h3 className="text-lg font-bold text-slate-950">{place.name}</h3>
        <p className="mt-1 text-sm text-slate-500">{place.detail}</p>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center gap-1 text-slate-500">
              <MapPin className="h-4 w-4" /> ระยะทาง
            </div>
            <b>{place.distance} m.</b>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center gap-1 text-slate-500">
              <Route className="h-4 w-4" /> เวลาเดิน
            </div>
            <b>{place.walk} นาที</b>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" /> {place.hours}
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-slate-400" />
            <a href={`tel:${(place.phone ?? '').replace(/[^0-9+]/g, '')}`} className="hover:text-9e-action hover:underline">
              {place.phone}
            </a>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <a
            href={place.maps}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center rounded-2xl bg-[#005CFF] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#004EE0]"
          >
            <Navigation className="mr-2 h-4 w-4" /> เปิดแผนที่
          </a>
          <a
            href={place.maps}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`ดูรายละเอียด ${place.name}`}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </motion.article>
  );
}

function TopNearbyCard({ place, index }) {
  return (
    <a
      href={place.maps}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E6F1FF] font-bold text-[#005CFF]">
        {index + 1}
      </div>
      <img
        src={place.image_url}
        alt={place.name}
        className="h-16 w-16 shrink-0 rounded-2xl object-cover"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-slate-950">{place.name}</div>
        <div className="text-sm text-slate-500">
          {place.label} · {place.distance} m · {place.walk} นาที
        </div>
      </div>
    </a>
  );
}

function FilterButton({ filter, active, onClick }) {
  const Icon = filter.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${
        active
          ? 'border-[#005CFF] bg-[#005CFF] text-white shadow-lg shadow-blue-500/15'
          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'
      }`}
    >
      <Icon className="h-4 w-4" />
      {filter.label}
    </button>
  );
}

function MapView({ filteredPlaces }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-3">
        {filteredPlaces.map((place) => (
          <a
            key={place._id}
            href={place.maps}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
          >
            <div className="font-bold text-slate-950">{place.name}</div>
            <div className="text-sm text-slate-500">{place.detail}</div>
            <div className="mt-2 text-sm font-bold text-[#005CFF]">
              {place.distance} m · เดิน {place.walk} นาที
            </div>
          </a>
        ))}
      </div>

      <div className="relative min-h-[560px] overflow-hidden rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,#E0F2FE,#F8FAFC,#DBEAFE)] shadow-sm">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-blue-300" />
        <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-blue-300" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-[#005CFF] px-5 py-4 text-center font-bold text-white shadow-xl">
          9Expert Training
        </div>
        {filteredPlaces.slice(0, mapPositions.length).map((place, index) => {
          const [left, top] = mapPositions[index];
          const markerLabel = place.name.split(' ')[0] || place.name;
          return (
            <a
              key={place._id}
              href={place.maps}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-lg transition hover:bg-blue-50 hover:text-[#005CFF]"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              {markerLabel} · {place.distance}m
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function NearbyPageClient({ places = [] }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [query,        setQuery]        = useState('');
  const [mapMode,      setMapMode]      = useState(false);

  const filteredPlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places
      .filter((p) => activeFilter === 'all' || p.type === activeFilter)
      .filter((p) => !q || `${p.name} ${p.detail ?? ''} ${p.label ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.distance - b.distance);
  }, [activeFilter, query, places]);

  const nearestPlaces   = useMemo(() => [...places].sort((a, b) => a.distance - b.distance).slice(0, 3), [places]);
  const nearestDistance = nearestPlaces[0]?.distance ?? 0;
  const nearestWalk     = nearestPlaces[0]?.walk ?? 0;
  const categoryCount   = filters.length - 1;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F5FAFF_0%,#FFFFFF_45%,#F8FAFC_100%)] text-slate-900">

      {/* ── Hero ── */}
      <section className="px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>

            <h1 className="font-bold max-w-3xl text-4xl tracking-normal leading-normal text-slate-950 sm:text-5xl sm:leading-normal lg:text-5xl lg:leading-tight">
              โรงแรม ร้านอาหาร<br />และคาเฟ่ใกล้สถาบัน
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-6 text-slate-600">
              เลือกสถานที่ใกล้ที่สุดสำหรับวันอบรม ดูเวลาเดิน เบอร์โทร และเปิดแผนที่ได้ทันที
              เหมาะสำหรับผู้เรียนที่ต้องการหาที่พัก อาหารกลางวัน หรือกาแฟก่อนเข้าเรียน
            </p>
            <div className="mt-6 grid max-w-sm grid-cols-3 gap-3 sm:max-w-2xl">
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="text-3xl font-bold text-[#005CFF]">{nearestDistance}m</div>
                <div className="text-sm text-slate-500">ใกล้สุด</div>
              </div>
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="text-3xl font-bold text-[#005CFF]">{nearestWalk}min</div>
                <div className="text-sm text-slate-500">เดินถึงเร็ว</div>
              </div>
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="text-3xl font-bold text-[#005CFF]">{categoryCount}</div>
                <div className="text-sm text-slate-500">หมวดหลัก</div>
              </div>
            </div>
          </div>

          {/* Top 3 card */}
          <div className="rounded-[32px] border border-white bg-white/80 p-5 shadow-2xl backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-slate-500">แนะนำใกล้สุด</div>
                <div className="text-xl font-bold text-slate-950">Top nearby picks</div>
              </div>
            </div>
            <div className="space-y-3">
              {nearestPlaces.map((place, index) => (
                <TopNearbyCard key={place._id} place={place} index={index} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Sticky filter bar ── */}
      <section className="sticky top-0 z-10 border-y border-slate-200 bg-white/90 px-5 py-3 backdrop-blur sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {filters.map((filter) => (
              <FilterButton
                key={filter.key}
                filter={filter}
                active={activeFilter === filter.key}
                onClick={() => setActiveFilter(filter.key)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาชื่อร้าน / ประเภทอาหาร"
                className="h-11 w-full rounded-full border border-slate-200 pl-10 pr-4 text-sm outline-none transition focus:border-[#005CFF] focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <button
              type="button"
              onClick={() => setMapMode((v) => !v)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold transition hover:bg-slate-50"
            >
              {mapMode ? 'ดูการ์ด' : 'ดูแผนที่'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Place list ── */}
      <section className="px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">สถานที่ทั้งหมด</h2>
              <p className="text-sm text-slate-500">เรียงจากใกล้ไปไกล · พบ {filteredPlaces.length} รายการ</p>
            </div>
          </div>

          {filteredPlaces.length > 0 ? (
            mapMode ? (
              <MapView filteredPlaces={filteredPlaces} />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredPlaces.map((place) => (
                  <PlaceCard key={place._id} place={place} />
                ))}
              </div>
            )
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="text-lg font-bold text-slate-950">ไม่พบสถานที่ที่ตรงกับการค้นหา</div>
              <p className="mt-2 text-sm text-slate-500">ลองเปลี่ยนคำค้นหาหรือเลือกหมวดหมู่อื่น</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}