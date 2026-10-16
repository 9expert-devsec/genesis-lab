import { getContactVideo } from '@/lib/actions/contact';
import { toEmbedUrl } from '@/lib/youtube';

const FALLBACK_TITLE = 'แนะนำการเดินทางมาสถาบัน 9Expert Training';

export default async function VideoSection() {
  const video = await getContactVideo();
  const embedUrl = toEmbedUrl(video.youtube_url);
  if (!embedUrl) return null;

  const title = video.title_th || FALLBACK_TITLE;

  return (
    <section className="bg-9e-ice py-16 dark:bg-9e-navy md:py-20">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-bold leading-normal text-9e-navy dark:text-white md:text-4xl">
            {title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
            รับชมวิดีโอแนะนำเส้นทางและวิธีการเดินทาง เพื่อให้คุณเดินทางได้อย่างสะดวก
          </p>
        </div>

        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-[#E2E8F0] bg-9e-navy shadow-[0_20px_50px_-12px_rgba(13,27,42,0.35)] dark:border-9e-border dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)]">
          <iframe
            src={embedUrl}
            title={title}
            className="aspect-video w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
