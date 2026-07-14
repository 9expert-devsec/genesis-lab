import Link from "next/link";
import { getActiveCareerPaths } from "@/lib/career-paths/getCareerPaths";

export const metadata = {
  title: "เส้นทางอาชีพ | 9Expert Training",
  description:
    "เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ",
};
export const revalidate = 3600;

function Hero({ count }) {
  return (
    <section className="bg-gradient-to-r from-[#005CFF] to-[#2486FF]">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h1 className="text-4xl font-bold text-white md:text-4xl">
          เลือกเส้นทางอาชีพของคุณ
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">
          {count > 0
            ? `${count} เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ`
            : "เส้นทางอาชีพด้านเทคโนโลยี พร้อมหลักสูตรแนะนำเพื่อพัฒนาทักษะที่ตลาดต้องการ"}
        </p>
      </div>
    </section>
  );
}

function CareerPathCard({ path }) {
  const href = path.api_slug ? `/${path.api_slug}` : "/career-path-project";
  const hasHero = Boolean(path.hero_image_url);

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
    >
      {hasHero ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={path.hero_image_url}
          alt={path.hero_image_alt || path.title}
          className="h-[200px] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-[160px] items-center justify-center bg-[#F8FAFD]">
          {path.icon_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={path.icon_url}
              alt={path.title}
              className="h-16 w-16 object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-3xl font-extrabold text-[#005CFF]/30">
              {path.title?.slice(0, 1) ?? "?"}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col px-5 py-4">
        <h2 className="text-lg font-bold text-[#0D1B2A] group-hover:text-[#005CFF]">
          {path.title}
        </h2>
        {path.short_description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {path.short_description}
          </p>
        )}
        <p className="mt-3 text-sm font-semibold text-[#2486FF]">
          ดูรายละเอียด →
        </p>
      </div>
    </Link>
  );
}

function CareerPathPromotionSection() {
  const discounts = [
    { people: "1 - 2 คน", discount: "ลด 15 %" },
    { people: "3 - 5 คน", discount: "ลด 20 %" },
    { people: "6 - 10 คน", discount: "ลด 25 %" },
    {
      people: "11 คนขึ้นไป",
      discount: "ลดสูงสุด",
      discountAmount: "30 %",
      highlighted: true,
    },
  ];

  const benefits = [
    {
      title: "Certificate",
      description:
        "ใบประกาศนียบัตรสำหรับทุกหลักสูตรที่อยู่ในโปรแกรม Career Path ที่ท่านลงเรียน",
    },
    {
      title: "Digital Badge Certificate",
      description:
        "ตรารับรองทักษะและความสามารถของผู้เรียนในโปรแกรม Career Path",
      note: "*ได้รับเมื่อผ่าน Workshop Project ตามเกณฑ์แต่ละ Career Path",
    },
    {
      title: "Cheat Sheet",
      description: "สำหรับใช้เป็นแนวทางในการทำโปรเจกต์และทบทวนความรู้",
    },
  ];

  const promotionConditions = [
    "ราคาก่อนภาษีมูลค่าเพิ่ม",
    "ระยะเวลาโปรโมชั่น 1 ม.ค. 69 - 31 ธ.ค. 69",
    "ต้องชำระค่าใช้จ่ายในการสมัครให้เรียบร้อยภายใน 30 วัน (นับจากวันที่ออกใบเสนอราคา)",
    "สำหรับหลักสูตร Career Path จะไม่สามารถซื้อรวมแพ็กเกจกับ Career Path อื่นได้",
    "โปรโมชั่นดังกล่าว เฉพาะในรอบอบรมที่กำหนดและเลือกรอบอบรมแต่ละหลักสูตรได้ไม่เกิน 6 เดือนนับจากวันที่สมัคร",
    "สงวนสิทธิ์การเรียนซ้ำ เลื่อนรอบอบรม หรือยกเลิก ในทุกกรณี",
    "หากผู้เข้าอบรมไม่สามารถเข้าร่วมในวันอบรมที่กำหนด จะถือว่าสละสิทธิ์ และทางสถาบันขอสงวนสิทธิ์ไม่คืนเงินในทุกกรณี",
    "การสมัคร 1 Career Path ต้องระบุรายชื่อ 1 ท่าน ไม่สามารถเปลี่ยนรายชื่อผู้เข้าอบรมได้ในทุกกรณี",
    "โปรโมชั่นข้างต้นไม่สามารถแยกเอกสารในการชำระเงินได้ในทุกกรณี (ใบเสนอราคา, ใบแจ้งหนี้, ใบเสร็จรับเงิน, ใบกำกับภาษี)",
  ];

  const notes = [
    "สิทธิ์นี้ไม่สามารถแลกเป็นเงินสด",
    "สงวนสิทธิ์ในการเปลี่ยนแปลงวันที่การอบรม",
    "สงวนสิทธิ์สำหรับผู้ที่ชำระเงินภายในระยะเวลาที่กำหนดเท่านั้น",
    "หากมีการเปลี่ยนแปลงสิทธิพิเศษเป็นแบบอื่น ทางสถาบันฯ ขอสงวนสิทธิ์ในการแจ้งให้ท่านทราบล่วงหน้า",
  ];

  return (
    <section
      aria-labelledby="career-path-promotion-heading"
      className="space-y-8"
    >
      <div className="rounded-2xl border border-9e-air bg-white px-5 py-7 md:px-8">
        <div
          id="career-path-promotion-heading"
          className="text-center text-xl font-bold text-[#0D1B2A] font-thai"
        >
          <h2 className="text-[#FF4D4F]">โปรโมชันพิเศษ!</h2>{" "}
          รวมทีมแล้วมาสมัครเรียนกัน ลดแรงทุกระดับ
        </div>

        <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {discounts.map((item) => (
            <div
              key={item.people}
              className={`flex min-h-32 flex-col items-center justify-center rounded-xl border px-3 py-5 text-center ${
                item.highlighted
                  ? "border-9e-air bg-9e-air text-[#0D1B2A]"
                  : "border-gray-200 bg-white text-[#0D1B2A] shadow-sm"
              }`}
            >
              <p className="text-base font-bold">
                สมัคร
                <br />
                {item.people}
              </p>
              <p
                className={`mt-4 font-extrabold ${
                  item.highlighted ? "text-2xl text-white" : "text-xl"
                }`}
              >
                {item.discount}
                {item.discountAmount && (
                  <>
                    <br />
                    <span className="text-2xl">{item.discountAmount}</span>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-[#0D1B2A] md:text-sm">
          *ส่วนลดสูงสุด 30% สำหรับผู้สมัครพร้อมกัน 11 ท่าน
          (ได้ทั้งนามบุคคลหรือองค์กร) ในแต่ละ Career Path
          ท่านสามารถสอบถามเพื่อรับสิทธิ์ราคาพิเศษได้กับเจ้าหน้าที่ฝ่ายขายทาง
          LINE{" "}
          <a
            href="https://line.me/R/ti/p/%409expert"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#005CFF] hover:underline"
          >
            @9expert
          </a>
        </p>
      </div>

      <div className="space-y-5">
        <h3 className="text-center text-base font-bold text-[#0D1B2A]">
          สำหรับการเรียนในโปรแกรม Career Path ท่านจะได้รับสิทธิพิเศษดังต่อไปนี้
        </h3>

        <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="rounded-xl bg-[#F5F8FC] px-5 py-5 text-center shadow-sm"
            >
              <h4 className="min-h-10 text-base font-bold leading-5 text-[#0D1B2A]">
                {benefit.title}
              </h4>
              <p className="mt-3 text-sm leading-relaxed text-[#0D1B2A]">
                {benefit.description}
              </p>
              {benefit.note && (
                <p className="mt-3 text-xs leading-relaxed text-[#FF4D4F]">
                  {benefit.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 text-[#0D1B2A]">
        <h3 className="text-lg font-bold">เงื่อนไขโปรโมชัน</h3>
        <ul className="list-disc space-y-1 pl-5 text-base leading-relaxed">
          {promotionConditions.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ul>
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl bg-[#F8FAFD] p-6 shadow-sm md:px-8">
        <h3 className="text-lg font-bold text-[#0D1B2A]">
          กรณีเป็นศิษย์เก่า 9Expert
        </h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-base leading-relaxed text-[#0D1B2A]">
          <li>
            ผู้เรียนที่เคยเรียนบางคอร์สใน Career Path Program สามารถใช้{" "}
            <strong className="text-[#00AEEF]">สิทธิ์ Transfer Module</strong>{" "}
            เพื่อหักค่าใช้จ่ายในการลงทะเบียนได้
          </li>
          <li>
            ต้องลงทะเบียนเรียนคอร์สที่เหลือในโปรแกรมให้ครบเท่านั้น{" "}
            <strong>
              เพื่อรับใบประกาศนียบัตรพิเศษ (Certificate) สำหรับ Career Path
              Program
            </strong>{" "}
            เพิ่มอีก 1 ใบ
          </li>
          <li>
            <strong className="text-[#00AEEF]">ใช้สิทธิ์ได้ภายใน 10 ปี</strong>{" "}
            นับจากวันเรียนเดิมของคอร์สนั้น ๆ
          </li>
        </ul>
      </div>

      <div className="space-y-3 text-[#0D1B2A]">
        <h3 className="text-lg font-bold">หมายเหตุ</h3>
        <ul className="list-disc space-y-1 pl-5 text-base leading-relaxed">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 text-base leading-relaxed text-[#0D1B2A]">
        <p>
          หากมีคำถามหรือข้อสงสัยเพิ่มเติม ติดต่อเราได้ที่ LINE Official{" "}
          <a
            href="https://line.me/R/ti/p/%409expert"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#005CFF] hover:underline"
          >
            @9expert
          </a>
        </p>
        <p>
          หรือสนใจดูรายละเอียดหลักสูตรอื่น ๆ เพิ่มเติม สามารถดูได้ที่นี่ :{" "}
          <Link
            href="/training-course"
            className="font-semibold text-[#005CFF] hover:underline"
          >
            รายละเอียดหลักสูตร
          </Link>
        </p>
      </div>
    </section>
  );
}

export default async function Page() {
  const paths = await getActiveCareerPaths();

  return (
    <>
      <Hero count={paths.length} />
      <section className="mx-auto max-w-6xl px-4 py-12">
        {paths.length === 0 ? (
          <p className="py-16 text-center text-gray-500">
            ยังไม่มีข้อมูล กรุณา Sync ข้อมูลจาก Admin
          </p>
        ) : (
          <div className="space-y-12">
            <div className="space-y-2 text-center">
              <div className="text-[28px] font-semibold text-9e-navy">
                Build your Future with Career Path Program
                <br />
                9Expert ชวนอัปสกิลและต่อยอดความรู้ตามสายอาชีพ (Career Path)
                <br />
              </div>
              <div className="text-[20px] font-normal text-9e-navy">
                มาคนเดียวก็เลิศ มาทั้งกลุ่มก็ปัง ลดสูงสุด 30 %
                ได้ความรู้+ใบรับรอง อัปความมั่นใจในสายงาน <br />
                ปี 2026 นี้เราเตรียมแพ็กเกจคอร์สอบรมมามอบให้แล้วกว่า 10 สายอาชีพ
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {paths.map((p) => (
                <CareerPathCard key={p.career_path_id} path={p} />
              ))}
            </div>

            <CareerPathPromotionSection />
          </div>
        )}
      </section>
    </>
  );
}
