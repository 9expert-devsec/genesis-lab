"use client";

import { motion } from "framer-motion";
import { BookOpen, Code2, Rocket, Target, ArrowRight } from "lucide-react";

const CARDS = [
  {
    icon: BookOpen,
    title: "เรียนรู้จากโจทย์จริง",
    body: "หลักสูตรออกแบบจากโจทย์ในงานจริงและกรณีศึกษาขององค์กรชั้นนำในประเทศไทย",
  },
  {
    icon: Code2,
    title: "ฝึกปฏิบัติจริง",
    body: "Workshop, Lab และ Hands-on ในทุกหลักสูตร เพื่อให้ผู้เรียนได้ลงมือทำจริงในห้องเรียน",
  },
  {
    icon: Rocket,
    title: "นำไปใช้ในงานได้ทันที",
    body: "เครื่องมือ เทคนิค และ Best Practice ที่นำกลับไปใช้ได้ทันทีในวันถัดไป",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export default function MissionSection() {
  return (
    <section className="bg-9e-ice py-24 dark:bg-[#0D1B2A]">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <h2 className="text-3xl font-extrabold leading-normal text-[#0D1B2A] dark:text-white md:text-5xl">
            <span className="block text-3xl">ทำไมต้องเลือก</span>
            <span
              className="block bg-clip-text text-transparent mt-2"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#48B0FF 0%,#005CFF 50%,#48B0FF 100%)",
              }}
            >
              9Expert
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
            เราเชื่อว่าทักษะเทคโนโลยีไม่ควรเป็นเรื่องไกลตัว
            ทุกหลักสูตรถูกออกแบบจากปัญหาจริงในโลกการทำงาน
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="relative grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-4"
        >
          {CARDS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="relative">
              <motion.div
                variants={item}
                className="group h-full rounded-2xl border border-white/80 bg-white/60 p-8 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md dark:hover:border-[#005CFF]/40 dark:hover:shadow-[0_8px_32px_rgba(0,92,255,0.15)]"
              >
                <div
                  className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(0,92,255,0.45)]"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg,#005CFF 0%,#2486FF 100%)",
                  }}
                >
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#465469] dark:text-[#94a3b8]">
                  {body}
                </p>
              </motion.div>

              {/* {i < CARDS.length - 1 && (
                <div
                  aria-hidden
                  className="absolute right-[-14px] top-1/2 hidden -translate-y-1/2 text-[#005CFF]/40 md:block"
                >
                  <ArrowRight className="h-5 w-5" />
                </div>
              )} */}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
