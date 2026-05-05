import { getLandingData } from "@/lib/landing/getLandingData";
import { getInstructors } from "@/lib/actions/about";
import { listPublicCourses } from "@/lib/api/public-courses";

import HeroUniverse from "@/components/about2/HeroUniverse";
import MissionSection from "@/components/about2/MissionSection";
import KPISection from "@/components/about2/KPISection";
import HowWeTeachSection from "@/components/about2/HowWeTeachSection";
import InstructorSection2 from "@/components/about2/InstructorSection2";
import LearningUniverseSection from "@/components/about2/LearningUniverseSection";
import JoinUsSection from "@/components/about2/JoinUsSection";

export const revalidate = 3600;

export function generateMetadata() {
  return {
    title: "เกี่ยวกับเรา | 9Expert Training",
    description:
      "9Expert Learning Universe — ผู้นำด้านการอบรม Data, AI, Business และ Technology ในประเทศไทย",
  };
}

function DarkToLight() {
  return (
    <div
      aria-hidden
      className="h-20 bg-gradient-to-b from-[#060e1a] to-[#F8FAFD] dark:to-[#0D1B2A]"
    />
  );
}

function LightToDark() {
  return (
    <div
      aria-hidden
      className="h-20 bg-gradient-to-b from-[#F8FAFD] to-[#060e1a] dark:from-[#0D1B2A]"
    />
  );
}

export default async function AboutUs2Page() {
  const [landingData, instructors, courses] = await Promise.all([
    getLandingData(),
    getInstructors(),
    listPublicCourses(),
  ]);

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
      {/* <DarkToLight /> */}
      <MissionSection />
      {/* <LightToDark /> */}
      <KPISection stats={stats} />
      {/* <DarkToLight /> */}
      <HowWeTeachSection />
      {/* <LightToDark /> */}
      <InstructorSection2 instructors={instructors} />
      {/* <DarkToLight /> */}
      {/* <LearningUniverseSection landingData={landingData} />
      <LightToDark /> */}
      <JoinUsSection />
    </main>
  );
}
