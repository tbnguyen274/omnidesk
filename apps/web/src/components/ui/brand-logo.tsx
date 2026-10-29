import Image from "next/image";

/** Shared transparent vector wordmark for the header and authentication screens. */
export function BrandLogo({
  className = "h-12 w-48",
  sizes = "192px",
}: {
  className?: string;
  sizes?: string;
}) {
  return (
    <span className={`relative block shrink-0 overflow-hidden ${className}`}>
      <Image
        src="/brand/omnidesk_logo.svg"
        alt="OmniDesk"
        fill
        sizes={sizes}
        loading="eager"
        unoptimized
        className="object-contain"
      />
    </span>
  );
}
