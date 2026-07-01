import { useId } from 'react';

export function BrandLogo({ className = '' }: { className?: string }) {
  const arcId = useId();

  return (
    <svg className={`farm-logo-mark ${className}`} viewBox="0 0 96 96" role="img" aria-label="みのり日和ファームのロゴ">
      <defs>
        <path id={arcId} d="M 14 50 A 34 34 0 0 1 82 50" />
      </defs>
      <text className="farm-logo-mark__ring">
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">MINORI BIYORI FARM</textPath>
      </text>
      <g className="farm-logo-mark__sprout">
        <path d="M48 58V39" />
        <path d="M47.5 45C36 45 31 38 30 29c10-.5 17 4 17.5 16Z" />
        <path d="M48.5 45C60 45 65 38 66 29c-10-.5-17 4-17.5 16Z" />
      </g>
      <g className="farm-logo-mark__furrows">
        <path d="M19 62c11-6 21-6 29 0 8-6 18-6 29 0" />
        <path d="M23 70c9-4 17-4 25 0 8-4 16-4 25 0" />
        <path d="M29 77c7-3 13-3 19 0 6-3 12-3 19 0" />
      </g>
    </svg>
  );
}
