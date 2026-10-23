import { type CSSProperties, memo } from 'react';
import { LAMP_LIGHT, type Part, type Tone } from './desk-geometry';
import type { SolidPaths } from './iso';

function Solid({
  paths,
  tone,
  crease = 'faint',
}: {
  paths: SolidPaths;
  tone: Tone;
  crease?: Tone | 'none';
}) {
  return (
    <g className="iso-solid">
      <path className="iso-fill" d={paths.fill} />
      {paths.shades.map((d, shade) =>
        d ? <path key={d} className="iso-shade" data-shade={shade} d={d} /> : null,
      )}
      <path className="iso-top" d={paths.top} />
      {crease !== 'none' && paths.crease && (
        <path className="iso-line" data-tone={crease} d={paths.crease} />
      )}
      {crease !== 'none' && paths.bevel && (
        <path className="iso-line" data-tone={crease} d={paths.bevel} />
      )}
      <path className="iso-line" data-tone={tone} d={paths.outline} />
    </g>
  );
}

/** Parts are immutable, so a part only redraws when it is replaced, not each countdown tick. */
export const DeskPart = memo(function DeskPart({
  part,
}: {
  part: Exclude<Part, { kind: 'book' | 'drawer' }>;
}) {
  switch (part.kind) {
    case 'halo':
      return <path className="iso-halo" d={part.d} filter="url(#desk-halo)" />;
    case 'solid':
      return (
        <Solid
          paths={part.paths}
          tone={part.tone}
          {...(part.crease ? { crease: part.crease } : {})}
        />
      );
    case 'line':
      return (
        <path
          className="iso-line"
          data-tone={part.tone}
          data-dotted={part.dotted ? '' : undefined}
          d={part.d}
        />
      );
    case 'lit':
      return (
        <>
          {part.shade !== undefined && (
            <path className="paper" d={part.d} style={{ '--shade': part.shade } as CSSProperties} />
          )}
          {part.light > 0.01 && (
            <path
              className="lamp-light lamp-pool"
              d={part.d}
              fill="url(#lamp-pool-space)"
              opacity={Math.min(1, part.light)}
            />
          )}
        </>
      );
    case 'writing':
      return (
        <text
          className="desk-writing"
          transform={part.transform}
          x={part.x}
          y={part.y}
          fontSize={part.size}
        >
          {part.text}
        </text>
      );
    case 'light':
      return part.layer === 'pool' ? (
        <ellipse
          className="lamp-light lamp-pool"
          cx={LAMP_LIGHT.pool.cx}
          cy={LAMP_LIGHT.pool.cy}
          rx={LAMP_LIGHT.pool.rx}
          ry={LAMP_LIGHT.pool.ry}
          fill="url(#lamp-pool)"
          clipPath="url(#desk-top)"
        />
      ) : (
        <path className="lamp-light lamp-rim" d={LAMP_LIGHT.rim} />
      );
  }
});
