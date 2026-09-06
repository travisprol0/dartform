# Real throw trace fixtures

Raw recordings live in `json-throws/` and are imported explicitly by
`recordings.ts`. They are exported from the development-only landmark trace
recorder on the capture screen and contain pose coordinates, timing,
visibility, and detector state only—never camera images or video.

The corpus includes a profile-view single throw, aim-pump negative, throw
then take the next dart, and two Pixel three-dart rounds. Each fixture is
replayed exactly once and must emit its declared `expectedThrowCount`.

Record multiple profile-view clips for every scenario in the recorder. Keep
each clip short, perform only the selected scenario, and do not edit its
`expectedThrowCount`. Before committing a trace, review the JSON and remove
anything outside the documented schema.

Add each reviewed recording to `recordings.ts`. A fixture must never be
retried until it passes or modified to resemble the detector's assumptions.
