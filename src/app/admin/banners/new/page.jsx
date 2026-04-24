import { BannerForm } from '../_components/BannerForm';

export const metadata = { title: 'เพิ่ม Banner' };

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-9e-navy mb-6">เพิ่ม Banner ใหม่</h1>
      <BannerForm />
    </div>
  );
}
