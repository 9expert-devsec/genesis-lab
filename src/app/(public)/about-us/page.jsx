import HeroUniverse from "@/components/about/HeroUniverse";
import MissionSection from "@/components/about/MissionSection";
import KPISection from "@/components/about/KPISection";
import HowWeTeachSection from "@/components/about/HowWeTeachSection";
import InstructorSection2 from "@/components/about/InstructorSection2";
import JoinUsSection from "@/components/about/JoinUsSection";

import { getInstructors } from "@/lib/actions/about";

export const revalidate = 3600;

export function generateMetadata() {
  return {
    title: "เกี่ยวกับเรา | 9Expert Training",
    description:
      "9Expert Learning Universe — ผู้นำด้านการอบรม Data, AI, Business และ Technology ในประเทศไทย",
  };
}

export default async function AboutUsPage() {
  const instructors = await getInstructors();

  const stats = [
    { value: 90, suffix: "K+", label: "ผู้เรียน" },
    { value: 5, suffix: "K+", label: "องค์กร" },
    { value: 4.9, suffix: "", label: "คะแนนรีวิว", decimals: 1 },
    { value: 700, suffix: "K+", label: "ผู้ติดตาม" },
    { value: 73, suffix: "", label: "หลักสูตร" },
  ];

  return (
    <main>
      <HeroUniverse />
      <MissionSection />
      <KPISection stats={stats} />
      <HowWeTeachSection />
      <InstructorSection2 instructors={instructors} />
      <JoinUsSection />
    </main>
  );
}
