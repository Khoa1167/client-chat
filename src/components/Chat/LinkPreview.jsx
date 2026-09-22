import { Capacitor } from '@capacitor/core';
import useElementVisibility from '../../hooks/useElementVisibility';
import useLinkPreview from '../../hooks/useLinkPreview';
import Spinner from '../common/Spinner';

export default function LinkPreview({ url }) {
  const [ref, visible] = useElementVisibility();
  const { preview, loading } = useLinkPreview(url, visible);

  // Don't render on web (no CORS bypass) or if no preview data and not loading
  if (!Capacitor.isNativePlatform() || (!loading && !preview)) {
    return null;
  }

  const domain = url ? new URL(url).hostname : '';

  return (
    <div ref={ref} className="mt-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 overflow-hidden hover:border-base-400 transition-colors"
      >
        {loading ? (
          <div className="w-full aspect-video flex items-center justify-center bg-base-200">
            <Spinner size="sm" className="text-base-content/40" />
          </div>
        ) : preview?.image ? (
          <img
            src={preview.image}
            alt="preview"
            className="w-full aspect-video object-cover bg-base-200"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : null}

        <div className="px-3 py-2 flex flex-col gap-1">
          <div className="text-xs text-base-content/50 font-medium">{domain}</div>
          {preview?.title && (
            <div className="text-sm font-semibold text-base-content line-clamp-2">
              {preview.title}
            </div>
          )}
          {preview?.description && (
            <div className="text-xs text-base-content/70 line-clamp-2">
              {preview.description}
            </div>
          )}
        </div>
      </a>
    </div>
  );
}
