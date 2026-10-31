// Assertion helpers shared by the emulator suites. They intentionally reuse the
// app's own util functions so the tests validate the real production shapes.
import {
  busyFromQueue,
  queueEntryOf,
  timeToMinEntry,
} from '../../src/utils/queue';

export { busyFromQueue, queueEntryOf, timeToMinEntry };
