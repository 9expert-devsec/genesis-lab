import { getContactVideo } from '@/lib/actions/contact';
import { toEmbedUrl } from '@/lib/youtube';

export default async function VideoSection() {
  const video = await getContactVideo();
  const embedUrl = toEmbedUrl(video.youtube_url);
  if (!embedUrl) return null;

  const { title_th, title_en } = video;

  return (
    <section className="bg-[#060e1a] py-20">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        {(title_th || title_en) && (
          <div className="mb-8 text-center">
            {title_th && (
              <h2 className="text-3xl font-extrabold text-white md:text-4xl">
                {title_th}
              </h2>
            )}
            {title_en && (
              <p className="mt-2 text-base text-[#99a1af]">{title_en}</p>
            )}
          </div>
        )}

        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-[#1e2939] bg-[#0d1f35] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]">
          <iframe
            src={embedUrl}
            title={title_th || title_en || 'YouTube video'}
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
