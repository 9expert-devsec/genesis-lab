export function InstructorQuote() {
  return (
    <section className="bg-gradient-to-br from-[#EEF6FF] to-white px-4 py-16 lg:px-6">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div>
          <div className="mb-4 font-serif text-6xl text-9e-sky/40" aria-hidden>
            &ldquo;
          </div>
          <p className="mb-6 text-lg font-medium leading-relaxed text-9e-navy">
            เราเป็นส่วนหนึ่งของการสนับสนุนบุคคลและองค์กร
            ในการปรับตัวตามความเปลี่ยนแปลงของเทคโนโลยี
            เพื่อนำมาใช้เพิ่มประสิทธิภาพการทำงาน สร้างความได้เปรียบ{' '}
            <strong>ให้เหนือคู่แข่ง</strong>
          </p>
          <p className="font-bold text-9e-navy">อ.ชไลเวท พิพัฒนพรรณวงศ์</p>
          <p className="text-sm text-9e-slate">
            ผู้อำนวยการฝ่ายฝึกอบรม
            <br />
            บจก.นายน์เอ็กซ์เพิร์ท
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <div className="relative h-80 w-72">
            <div className="absolute inset-0 rounded-full bg-9e-sky/10" />
            <div className="absolute bottom-0 left-1/2 h-72 w-64 -translate-x-1/2 rounded-2xl bg-gray-200" />
          </div>
        </div>
      </div>
    </section>
  );
}
