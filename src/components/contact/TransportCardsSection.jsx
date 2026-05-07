import Image from 'next/image';
import { MapPin, Train, Bus, Car, Plane, Ship, Bike } from 'lucide-react';
import { getActiveTransportCards } from '@/lib/actions/contact';

const ICON_MAP = { MapPin, Train, Bus, Car, Plane, Ship, Bike };
function resolveIcon(name) {
  return ICON_MAP[name] || MapPin;
}

export const TRANSPORT_ICON_OPTIONS = Object.keys(ICON_MAP);

function NumberedList({ text }) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  return (
    <ul className="space-y-3">
      {lines.map((line, i) => (
        <li key={`${i}-${line}`} className="flex items-start gap-3">
          <span className="mt-1.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(0,92,255,0.15)] text-xs font-semibold text-[#48B0FF]">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-[#d1d5dc]">{line}</span>
        </li>
      ))}
    </ul>
  );
}

function TransportCard({ card }) {
  const Icon = resolveIcon(card.icon_name);
  const hasTh = Boolean(String(card.description_th || '').trim());
  const hasEn = Boolean(String(card.description_en || '').trim());

  return (
    <article className="flex flex-col rounded-3xl border border-[#1e2939] bg-[linear-gradient(130deg,rgba(16,24,40,0.6)_0%,rgba(0,0,0,0.6)_100%)] p-6">
      {card.image_url && (
        <div className="mb-5 overflow-hidden rounded-2xl bg-[#0d1f35]">
          <Image
            src={card.image_url}
            alt={card.title_th}
            width={600}
            height={375}
            className="aspect-[16/10] h-auto w-full object-cover"
          />
        </div>
      )}

      <div className="mb-5 flex items-center gap-4">
        <div
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
          style={{
            backgroundImage: 'linear-gradient(135deg,#005CFF 0%,#2486FF 100%)',
          }}
        >
          <Icon className="h-7 w-7" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-white">{card.title_th}</h3>
          {card.title_en && (
            <p className="mt-0.5 text-sm text-[#99a1af]">{card.title_en}</p>
          )}
        </div>
      </div>

      {hasTh && <NumberedList text={card.description_th} />}
      {hasTh && hasEn && (
        <div className="my-5 h-px w-full bg-gradient-to-r from-transparent via-[#005CFF]/40 to-transparent" />
      )}
      {hasEn && <NumberedList text={card.description_en} />}
    </article>
  );
}

export default async function TransportCardsSection() {
  const cards = await getActiveTransportCards();
  if (!cards || cards.length === 0) return null;

  return (
    <section className="bg-[#060e1a] py-20">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">
            การเดินทางมายัง 9Expert
          </h2>
          <p className="mt-2 text-base text-[#99a1af]">
            How to get to 9Expert
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <TransportCard key={card._id} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}
