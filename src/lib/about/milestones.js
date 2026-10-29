/**
 * The /about-us timeline, oldest first, one entry per YEAR. The last year is
 * drawn as "now". A year holds one or more items (2026 has two), rendered
 * stacked under its single year label. Domains are plain text, not links.
 */
export const MILESTONES = Object.freeze([
  {
    year: 2005,
    items: [{
      title: 'ก่อตั้ง 9Expert Training',
      description: 'เริ่มต้นเป็นสถาบันฝึกอบรมเทคโนโลยีสำหรับคนทำงาน',
    }],
  },
  {
    year: 2020,
    items: [{
      title: 'เปิดระบบ E-Learning ครั้งแรก',
      description: 'เรียนออนไลน์ได้ทุกที่ ผ่าน online.9experttraining.com',
    }],
  },
  {
    year: 2022,
    items: [{
      title: 'เริ่มสอนแบบ Hybrid',
      description: 'จากเดิม Classroom อย่างเดียว เพิ่มการเรียนผ่าน Microsoft Teams',
    }],
  },
  {
    year: 2023,
    items: [{
      title: 'ได้รับการรับรองจาก DBD',
      description: 'กรมพัฒนาธุรกิจการค้า',
    }],
  },
  {
    year: 2025,
    items: [{
      title: 'ย้ายสู่ 9Expert Academy',
      description: '25 ต.ค. 2568 ย้าย E-Learning ไปที่ academy.9experttraining.com',
    }],
  },
  {
    year: 2026,
    items: [
      {
        title: 'รีแบรนด์ CI ใหม่',
        description: 'ปรับโทนสีและโลโก้ใหม่ทั้งหมด เป็นเอกลักษณ์ที่เห็นในวันนี้',
      },
      {
        title: 'ร่วมลงนาม One Platform for Skill Development',
        description: 'แพลตฟอร์มพัฒนาทักษะของกรมพัฒนาฝีมือแรงงาน กระทรวงแรงงาน',
      },
    ],
  },
]);
