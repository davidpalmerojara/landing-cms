'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface BlockImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /** Shown instead of the browser's broken-image icon when the picture can't load */
  fallback: ReactNode;
}

/**
 * An image of a block that falls back to the block's own placeholder when the
 * address is broken (QA-117). The page is rendered on the server, so the
 * picture can fail before React is there to hear `onError`: a mount check
 * catches that case.
 */
export default function BlockImage({ src, alt, className, style, fallback }: BlockImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0 && image.currentSrc) setFailedSrc(src);
  }, [src]);

  if (failedSrc === src) return <>{fallback}</>;
  return <img ref={imageRef} src={src} alt={alt} className={className} style={style} onError={() => setFailedSrc(src)} />;
}
