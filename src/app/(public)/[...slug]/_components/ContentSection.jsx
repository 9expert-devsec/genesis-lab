export function ContentSection({ id, title, action, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-6 w-1 rounded-full bg-9e-brand" />
          <h2 className="text-lg font-bold text-9e-navy">{title}</h2>
        </div>
        {action}
      </div>
      <div className="text-sm leading-relaxed text-9e-navy">{children}</div>
    </section>
  );
}
