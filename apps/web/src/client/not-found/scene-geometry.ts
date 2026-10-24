import { areaOf } from '../desk/iso';
import { DIGIT_CORNERS } from './digit-geometry';
import { SPYGLASS_REACH } from './spyglass-geometry';

const PAD = 10;
const { box } = areaOf([...DIGIT_CORNERS, ...SPYGLASS_REACH]);

export const VIEW_BOX = {
  x: box.x - PAD,
  y: box.y - PAD,
  width: box.width + PAD * 2,
  height: box.height + PAD * 2,
};
