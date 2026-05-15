'use client';

import { Bell, Send } from 'lucide-react';

export default function SocialCTABanner() {
  function scrollToChannels() {
    const el = document.getElementById('channels');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <section className="rounded-2xl bg-[#0D1B2A] px-6 py-6 md:px-8 md:py-8">
      <div className="flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-[#D4F73F]">
            <Send className="h-5 w-5" />
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-[#D4F73F]">
            <Bell className="h-5 w-5" />
          </div>
          <div className="ml-1">
            <p className="text-base font-bold text-white md:text-lg">
              ไม่พลาดทุกข่าวสารและคอนเทนต์ดี ๆ จากเรา
            </p>
            <p className="mt-1 text-sm text-gray-400">
              กดติดตามทุกช่องทาง เพื่อรับแรงบันดาลใจและพัฒนาตัวคุณไปด้วยกัน
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={scrollToChannels}
          className="shrink-0 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0D1B2A] transition-colors hover:bg-[#F8FAFD]"
        >
          ติดตามทุกช่องทาง →
        </button>
      </div>
    </section>
  );
}