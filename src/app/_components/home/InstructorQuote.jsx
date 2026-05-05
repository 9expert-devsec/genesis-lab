import Image from 'next/image';

/**
 * Founder/instructor quote band. Static content — name, title, and
 * portrait don't change often, so we don't gate this on a CMS fetch.
 *
 * Photo bleeds to the bottom edge: the section is `overflow-hidden`
 * and the right column anchors the image with `items-end`. On mobile
 * the photo is hidden so the quote keeps its own breathing room.
 */
export function InstructorQuote() {
  return (
    <section className="relative overflow-hidden">
      {/* Circuit board background — gradient + traces + nodes. All
          gradient/filter IDs are prefixed `instructor-` so they don't
          collide with other SVGs on the page. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 680 320"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="instructor-bg" cx="40%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#EEF6FF" />
            <stop offset="60%" stopColor="#DBEEFF" />
            <stop offset="100%" stopColor="#EEF6FF" />
          </radialGradient>
          <radialGradient id="instructor-ng1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#005CFF" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#005CFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="instructor-ng2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2486FF" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2486FF" stopOpacity="0" />
          </radialGradient>
          <filter id="instructor-gl">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="680" height="320" fill="url(#instructor-bg)" />

        {/* Dot grid top-right */}
        <g opacity="0.20">
          {[430, 444, 458, 472, 486, 500, 514, 528].flatMap((x) =>
            [16, 30, 44].map((y) => (
              <circle key={`tr-${x}-${y}`} cx={x} cy={y} r="1.3" fill="#005CFF" />
            ))
          )}
        </g>

        {/* Dot column right */}
        <g opacity="0.18">
          {[70, 84, 98, 112, 126, 140].flatMap((y) =>
            [600, 616].map((x) => (
              <circle key={`rc-${x}-${y}`} cx={x} cy={y} r="1.5" fill="#2486FF" />
            ))
          )}
        </g>

        {/* Background traces — dim */}
        <g fill="none" opacity="0.10">
          <polyline points="0,80 60,80 100,120 220,120 220,160 340,160" stroke="#48B0FF" strokeWidth="1" />
          <polyline points="0,180 50,180 90,220 200,220 200,260 300,260" stroke="#48B0FF" strokeWidth="1" />
          <polyline points="120,0 120,50 180,50 180,90 280,90" stroke="#48B0FF" strokeWidth="1" />
          <polyline points="680,180 620,180 620,230 560,230 560,280 480,280" stroke="#48B0FF" strokeWidth="1" />
          <polyline points="680,280 640,280 640,320" stroke="#48B0FF" strokeWidth="1" />
        </g>

        {/* Foreground traces — bright */}
        <g fill="none">
          <polyline points="0,110 90,110 130,150 420,150 460,110 680,110" stroke="#48B0FF" strokeWidth="1.2" opacity="0.1" />
          <polyline points="320,0 320,70 370,70 410,110 520,110 560,70 680,70" stroke="#48B0FF" strokeWidth="1" opacity="0.1" />
          <polyline points="180,0 220,40 330,40 370,0" stroke="#48B0FF" strokeWidth="1" opacity="0.20" />
          <polyline points="370,0 400,40 460,40 510,0" stroke="#48B0FF" strokeWidth="1" opacity="0.15" />
          <polyline points="0,270 110,270 150,230 460,230 500,270 680,270" stroke="#48B0FF" strokeWidth="1.2" opacity="0.18" />
          <line x1="320" y1="70" x2="320" y2="150" stroke="#48B0FF" strokeWidth="1" opacity="0.18" />
          <line x1="460" y1="110" x2="460" y2="150" stroke="#48B0FF" strokeWidth="1" opacity="0.18" />
          <line x1="150" y1="230" x2="150" y2="270" stroke="#48B0FF" strokeWidth="1" opacity="0.16" />
          <line x1="500" y1="230" x2="500" y2="270" stroke="#48B0FF" strokeWidth="1" opacity="0.16" />
          <line x1="90" y1="110" x2="90" y2="150" stroke="#48B0FF" strokeWidth="1" opacity="0.16" />
        </g>

        {/* Resistor components */}
        {/* <g fill="none" opacity="0.22">
          <rect x="122" y="143" width="16" height="14" rx="2" stroke="#005CFF" strokeWidth="0.9" />
          <rect x="370" y="143" width="16" height="14" rx="2" stroke="#2486FF" strokeWidth="0.9" />
          <rect x="312" y="62" width="16" height="16" rx="2" stroke="#2486FF" strokeWidth="0.9" />
          <rect x="450" y="222" width="16" height="14" rx="2" stroke="#005CFF" strokeWidth="0.9" />
        </g> */}

        {/* Junction nodes */}
        <g filter="url(#instructor-gl)">
          {[
            { cx: 90, cy: 110, r1: 5, r2: 2.8, grad: 'url(#instructor-ng1)', fill: '#48B0FF' },
            { cx: 320, cy: 150, r1: 5, r2: 2.8, grad: 'url(#instructor-ng1)', fill: '#48B0FF' },
            { cx: 460, cy: 150, r1: 5, r2: 2.8, grad: 'url(#instructor-ng2)', fill: '#48B0FF' },
            { cx: 150, cy: 270, r1: 5, r2: 2.2, grad: 'url(#instructor-ng1)', fill: '#48B0FF' },
            { cx: 500, cy: 270, r1: 5, r2: 2.2, grad: 'url(#instructor-ng2)', fill: '#48B0FF' },
            { cx: 320, cy: 70, r1: 5, r2: 2.2, grad: 'url(#instructor-ng2)', fill: '#48B0FF' },
            { cx: 460, cy: 110, r1: 5, r2: 2.2, grad: 'url(#instructor-ng1)', fill: '#48B0FF' },
          ].map((n, i) => (
            <g key={`node-${i}`}>
              <circle cx={n.cx} cy={n.cy} r={n.r1} fill={n.grad} />
              <circle cx={n.cx} cy={n.cy} r={n.r2} fill={n.fill} opacity="0.1" />
            </g>
          ))}
        </g>
      </svg>

      {/* Dark mode overlay — keeps the light circuit SVG visible
          underneath as a faint texture while shifting the dominant
          tone toward the dark navy CI palette. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] hidden bg-[#0a1628]/80 "
      />

      <div className="relative z-[2] mx-auto grid min-h-[400px] max-w-[1200px] grid-cols-1 lg:grid-cols-2  max-md:px-4">
        <div className="flex flex-col justify-center gap-6 py-12 lg:py-16">
          <span
            className="select-none font-serif text-7xl leading-none text-9e-primary"
            aria-hidden
          >
            &ldquo;
          </span>

          <p className="max-w-2xl text-lg font-bold tracking-wide text-center text-9e-navy sm:text-xl lg:text-2xl lg:leading-[1.5]">
            เราเป็นส่วนหนึ่งของการสนับสนุนบุคคลและองค์กร<br className="hidden lg:inline" />
            ในการปรับตัวตามความเปลี่ยนแปลงของเทคโนโลยี<br className="hidden lg:inline" />
            เพื่อนำมาใช้เพิ่มประสิทธิภาพการทำงาน สร้างความได้เปรียบ{' '}
            <span className="text-9e-primary">ให้เหนือคู่แข่ง</span>
          </p>

          <div className="hidden lg:inline text-center">
            <p className="text-base font-bold text-9e-navy ">
              อ.ชไลเวท พิพัฒพรรณวงศ์
            </p>
            <p className="text-sm text-9e-primary">
              ผู้อำนวยการฝ่ายฝึกอบรม
            </p>
            <p className="text-sm text-9e-slate">
              บริษัท นายน์เอ็กซ์เพิร์ท จำกัด Microsoft MVP Power BI
            </p>
          </div>
        </div>

        <div className=" min-h-[400px] items-center justify-center flex flex-col lg:items-end lg:justify-end">
          <Image
            src="/people/AJ.Chalaivate-1.png"
            alt="อ.ชไลเวท พิพัฒนพรรณวงศ์"
            width={400}
            height={500}
            className="object-contain object-bottom"
            style={{ maxHeight: '425px' }}
          />

          <div className="text-center lg:hidden py-6">
            <p className="text-base font-bold text-9e-navy ">
              อ.ชไลเวท พิพัฒพรรณวงศ์
            </p>
            <p className="text-sm text-9e-primary">
              ผู้อำนวยการฝ่ายฝึกอบรม
            </p>
            <p className="text-sm text-9e-slate">
              บริษัท นายน์เอ็กซ์เพิร์ท จำกัด Microsoft MVP Power BI
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
