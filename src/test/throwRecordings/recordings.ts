import aimPumpsJson from '../../../json-throws/throw-trace-2026-09-06T13-29-36-040Z-aim_pumps.json?raw';
import singleThrowJson from '../../../json-throws/throw-trace-2026-09-06T13-28-39-984Z-single_throw.json?raw';
import threeThrowsJson from '../../../json-throws/throw-trace-2026-09-06T22-34-23-715Z-three_throws.json?raw';
import threeThrowsRoundTwoJson from '../../../json-throws/throw-trace-2026-09-06T22-56-14-336Z-three_throws.json?raw';
import throwThenTakeNextJson from '../../../json-throws/throw-trace-2026-09-06T13-30-03-843Z-throw_then_take_next_dart.json?raw';
import {
  parseThrowRecording,
  type ThrowRecording,
} from '../../analysis/throwDetection/recording';

export const REAL_THROW_RECORDINGS: readonly ThrowRecording[] = [
  parseThrowRecording(singleThrowJson),
  parseThrowRecording(aimPumpsJson),
  parseThrowRecording(throwThenTakeNextJson),
  parseThrowRecording(threeThrowsJson),
  parseThrowRecording(threeThrowsRoundTwoJson),
];
