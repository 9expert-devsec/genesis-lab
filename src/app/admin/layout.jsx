import { AdminSidebar } from '@/components/layout/AdminSidebar';

export const metadata = {
  title: { default: 'Admin', template: '%s · Admin · 9Expert' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <main className="flex-1 bg-9e-navy px-4 py-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
