// Which parser belongs to which channel. One list for the CLI and the tests: when you add a channel to channels.js, add it here too.
import { CHANNELS } from '../channels.js';
import { parseFlChecked } from './fl.js';
import { parseKworkChecked } from './kwork.js';
import { parseFreelancehuntChecked } from './freelancehunt.js';
import { parseWeblancerChecked } from './weblancer.js';
import { parseFreelanceRuChecked } from './freelanceru.js';
import { parseTelegramChecked } from './telegram.js';
import { parsePchelChecked } from './pchel.js';
import { parseFreelancerChecked } from './freelancer.js';
import { parsePphChecked } from './pph.js';

export const PARSERS = {
  flcom: parseFreelancerChecked,
  pph: parsePphChecked,
  fl: parseFlChecked,
  kwork: parseKworkChecked,
  fh: parseFreelancehuntChecked,
  weblancer: parseWeblancerChecked,
  frru: parseFreelanceRuChecked,
  pchel: parsePchelChecked,
  ...Object.fromEntries(Object.entries(CHANNELS).filter(([, c]) => c.tg).map(([id, c]) => [id, (html, at) => parseTelegramChecked(html, at, c.tg)])),
};
