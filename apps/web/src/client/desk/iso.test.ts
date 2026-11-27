import { describe, expect, it } from 'vitest';
import { pathOf, prism, project, type Vec3 } from './iso';

/** An upright card with a tab rising off-centre from its top edge. */
const CARD: Vec3[] = [
  [0, 0, 0],
  [4, 0, 0],
  [4, 0, 2],
  [3.5, 0, 2],
  [3.5, 0, 3],
  [2.5, 0, 3],
  [2.5, 0, 2],
  [0, 0, 2],
];

describe('prism', () => {
  it('shades only the sides of a concave ring that face the viewer', () => {
    const { shades } = prism(CARD, [0, 0.5, 0]);
    expect(shades.join('').match(/Z/g)).toHaveLength(5);
  });

  it('outlines a concave ring down into its notches, leaving out the edges hidden behind it', () => {
    const { outline } = prism(CARD, [0, 0.5, 0]);
    const at = (corner: Vec3) => pathOf([project(corner)]).slice(1);
    expect(outline).toContain(at(CARD[3] as Vec3));
    expect(outline).not.toContain(at(CARD[6] as Vec3));
  });
});
