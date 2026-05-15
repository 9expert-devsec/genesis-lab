import Image from 'next/image';
import { Globe2, PlaySquare, Users } from 'lucide-react';
import SocialCTABanner from './_components/SocialCTABanner';

export const metadata = {
  title: 'Social Channels | 9Expert Training',
  description: 'ติดตาม 9Expert Training และ อ.ชไลเวท ได้ทุกช่องทางโซเชียลมีเดีย',
};

// ── Data ───────────────────────────────────────────────────────────

const LOGOS = {
  fb:     'https://res.cloudinary.com/ddva7xvdt/image/upload/v1778832018/fb-logo_zzvc5o.png',
  yt:     'https://res.cloudinary.com/ddva7xvdt/image/upload/v1778832020/yt-logo_lhd9i8.png',
  tiktok: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1778832019/tiktok-logo_az4qxy.png',
  ig:     'https://res.cloudinary.com/ddva7xvdt/image/upload/v1778832019/ig-logo_hsiqaz.png',
  line:   'https://res.cloudinary.com/ddva7xvdt/image/upload/v1778832019/line-logo_cmo9wc.png',
};

const channels = [
  {
    id: 'ceo-fb',
    name: 'Chalaivate Pipatpannawong',
    logo: LOGOS.fb,
    href: 'https://www.facebook.com/chalaivate',
    description: 'ติดตามแนวคิด มุมมอง และแรงบันดาลใจจาก CEO ของเรา',
    followers: '470K',
    cta: 'ติดตาม',
    ctaStyle: 'bg-[#1877F2] hover:bg-[#166FE5] text-white',
    isCeo: true,
  },
  {
    id: '9expert-fb',
    name: '9Expert Facebook',
    logo: LOGOS.fb,
    href: 'https://www.facebook.com/9ExpertTraining',
    description: 'ข่าวสาร อัปเดตกิจกรรม และคอนเทนต์เพื่อการพัฒนาทักษะ',
    followers: '230K',
    cta: 'ติดตาม',
    ctaStyle: 'bg-[#1877F2] hover:bg-[#166FE5] text-white',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    logo: LOGOS.yt,
    href: 'https://www.youtube.com/@9expert',
    description: 'วิดีโอความรู้ สัมมนา และคอนเทนต์คุณภาพจากผู้เชี่ยวชาญ',
    followers: '247K',
    cta: 'ดูช่อง',
    ctaStyle: 'bg-[#FF0000] hover:bg-[#CC0000] text-white',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    logo: LOGOS.tiktok,
    href: 'https://www.tiktok.com/@9experttraining',
    description: 'เนื้อหาสั้น กระชับ เข้าใจง่าย สำหรับการพัฒนาทุกวัน',
    followers: '293K',
    cta: 'ติดตาม',
    ctaStyle: 'bg-[#010101] hover:bg-[#333] text-white',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    logo: LOGOS.ig,
    href: 'https://www.instagram.com/9experttraining',
    description: 'แรงบันดาลใจ เคล็ดลับการพัฒนา และไลฟ์สไตล์การเรียนรู้',
    followers: '8.1K',
    cta: 'ติดตาม',
    ctaStyle: 'bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90 text-white',
  },
  {
    id: 'line',
    name: 'LINE Official',
    logo: LOGOS.line,
    href: 'https://line.me/R/ti/p/@9expert',
    description: 'รับข่าวสารล่าสุด โปรโมชันพิเศษ และสิทธิประโยชน์ก่อนใคร',
    followers: '10K',
    cta: 'เพิ่มเพื่อน',
    ctaStyle: 'bg-[#06C755] hover:bg-[#05A847] text-white',
  },
];

// Decorative floating icons on the hero — staggered grid mimicking a 3D phone.
// Each item: [logoKey, left%, top%, size in px, rotation deg]
const FLOATING_ICONS = [
  ['fb',     12,  8, 72,  -6],
  ['yt',     60, 14, 88,   8],
  ['ig',      4, 52, 64,  10],
  ['tiktok', 38, 46, 96,  -4],
  ['line',   72, 60, 72,   6],
  ['yt',     30, 82, 56, -10],
];

// ── Page ───────────────────────────────────────────────────────────

export default function SocialPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFD]">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-[#F8FAFD] to-[#E8F0FE] py-16 md:py-12">
        <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            {/* <span className="inline-flex rounded-full border border-[#2486FF] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#2486FF]">
              Social Channels
            </span> */}
            <h1 className="mt-5 text-4xl font-bold leading-tight text-[#0D1B2A] md:text-5xl">
              ติดตามเราได้ทุกช่องทาง
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-gray-600">
              ติดตาม CEO และบริษัทของเราในทุกช่องทางโซเชียลมีเดีย
              เพื่อไม่พลาดทุกข่าวสาร ความรู้ และคอนเทนต์ดี ๆ ที่เราตั้งใจสร้างสรรค์
              เพื่อการพัฒนาตัวคุณอย่างต่อเนื่อง
            </p>
          </div>

          {/* Floating icons illustration */}
          <div className="relative mx-auto h-[360px] w-full max-w-[440px]">
            {/* soft backdrop circle */}
            <div className="absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-2xl" />
            {FLOATING_ICONS.map(([key, left, top, size, rot], i) => (
              <div
                key={i}
                className="absolute flex items-center justify-center rounded-2xl bg-white shadow-[0_10px_30px_-10px_rgba(36,134,255,0.25)] ring-1 ring-gray-100"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  transform: `rotate(${rot}deg)`,
                }}
              >
                <img
                  src={LOGOS[key]}
                  alt=""
                  width={size * 0.55}
                  height={size * 0.55}
                  className="object-contain"
                  style={{ transform: `rotate(${-rot}deg)` }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1200px] space-y-10 py-12">

        {/* Bio card */}
        <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
          <div className="grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            <Image
              src="https://res.cloudinary.com/ddva7xvdt/image/upload/v1778833435/aj-vate_wor1hv.png"
              alt="อ.ชไลเวท พิพัฒพรรณวงศ์"
              width={96}
              height={96}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-[#E8F0FE]"
            />

            <div>
              <p className="text-sm font-semibold text-[#2486FF]">CEO</p>
              <h2 className="mt-0.5 text-xl font-bold text-[#0D1B2A]">
                อ.ชไลเวท พิพัฒพรรณวงศ์
              </h2>
              <p className="mt-2 max-w-2xl text-sm italic leading-6 text-gray-500">
                &ldquo;เราเป็นส่วนหนึ่งของการสนับสนุนบุคคลและองค์กรในการปรับตัวตามความเปลี่ยนแปลงของเทคโนโลยี
                เพื่อนำมาใช้เพิ่มประสิทธิภาพการทำงาน สร้างความได้เปรียบ ให้เหนือคู่แข่ง&rdquo;
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 border-gray-100 md:border-l md:pl-6">
              <Stat icon={Users}      value="470K+" label="ผู้ติดตามรวม" />
              <Stat icon={PlaySquare} value="1,500+" label="วิดีโอและคอนเทนต์" />
              <Stat icon={Globe2}     value="6"     label="ช่องทางออนไลน์" />
            </div>
          </div>
        </article>

        {/* Channel grid */}
        <section id="channels">
          <div className="mb-5 flex items-end justify-between border-b border-gray-100 pb-3">
            <h2 className="text-lg font-bold text-[#0D1B2A]">ช่องทางทั้งหมด</h2>
            <span className="text-xs text-gray-400">{channels.length} ช่องทาง</span>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        </section>

        {/* CTA banner */}
        <SocialCTABanner />
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Stat({ icon: Icon, value, label }) {
  return (
    <div>
      <Icon className="h-4 w-4 text-gray-400" />
      <p className="mt-1 text-xl font-bold text-[#2486FF]">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function ChannelCard({ channel }) {
  return (
    <a
      href={channel.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
    >
      {channel.isCeo && (
        <span className="absolute right-3 top-3 rounded-full bg-[#2486FF] px-2.5 py-0.5 text-[10px] font-bold text-white">
          CEO
        </span>
      )}

      <img
        src={channel.logo}
        alt={`${channel.name} logo`}
        width={48}
        height={48}
        className="mb-3 h-12 w-12 object-contain"
      />

      <h3 className="text-base font-bold text-[#0D1B2A]">{channel.name}</h3>
      <p className="mb-3 mt-1 text-sm text-gray-500">{channel.description}</p>

      <p className="mb-4 text-sm font-semibold text-[#0D1B2A]">
        <Users className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
        {channel.followers} ผู้ติดตาม
      </p>

      <span
        className={
          'mt-auto inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ' +
          channel.ctaStyle
        }
      >
        {channel.cta}
      </span>
    </a>
  );
}