# Observation geometry in JUDAS FIELD v0.3.0

This model connects altitude, ground speed and target visibility in the existing synthetic stress test. It illustrates a nadir camera and a stationary target on a central straight-line flyover. The formulas are geometric; the AI scoring coefficients, acquisition times and scene effects remain synthetic and have not been empirically calibrated.

## Inputs, outputs and assumptions

| Quantity | Unit | Meaning |
| --- | --- | --- |
| `altitude` | m | Height above the assumed flat ground plane; allowed range 15–120 m |
| `speed` | m/s | Constant ground speed; allowed range 0–12 m/s |
| `fov` | degrees | Full along-track field of view; default 60°, configurable in the engine from 1–170° |
| `observationCap` | s | Maximum experiment duration, default 30 s; engine range 1–120 s |
| `footprint` | m | Along-track ground length visible in the camera |
| `visibilityTime` | s or `null` | Geometric dwell time; `null` means continuous visibility in hover, identified by `hover: true` |
| `effectiveObservationTime` | s | Available acquisition time after applying the cap |
| `travelDistance` | m | Ground speed multiplied by effective observation time |

The default 60° FOV is an assumption for this demonstrator. It is **not a verified specification of DJI Matrice 4TD or any other camera**. The interface displays this assumed FOV; custom values can be supplied through the engine configuration, rather than a separate camera-selection UI. Sensor selection currently changes synthetic scoring and displayed imagery; it does not select a calibrated camera model.

For altitude `h`, ground speed `v`, full along-track FOV `θ`, and cap `C`:

```text
L = 2 × h × tan(θ × π / 360)
T = L / v                        when v > 0
E = min(T, C)                    when v > 0
T = continuous; E = C            when v = 0
D = v × E
```

All calculations use unrounded values. Display formatting rounds values for readability. The visibility calculation never divides by zero in hover. JSON exports use an explicit hover flag and `null` for unlimited geometric duration, while the effective duration remains finite.

| Example at 60° | Footprint | Geometric visibility | Effective duration with 30 s cap |
| --- | --- | --- | --- |
| 30 m, 12 m/s | 34.64 m | 2.89 s | 2.89 s |
| 30 m, 5 m/s | 34.64 m | 6.93 s | 6.93 s |
| 60 m, 12 m/s | 69.28 m | 5.77 s | 5.77 s |
| 30 m, 2 m/s | 34.64 m | 17.32 s | 17.32 s |
| 30 m, 0.5 m/s | 34.64 m | 69.28 s | 30 s |
| 30 m, hover | 34.64 m | Continuous / Hover | 30 s |

The cap limits the experiment; it does not redefine the geometric time or extend a target's stay in the frame. With a cap-limited run, the aircraft travels less than one full footprint during effective observation. In hover its travel distance is zero.

## Control synchronization

Altitude and speed form the canonical flight state. FOV and cap are additional configuration values. Target Visibility Time is an inverse control:

```text
required speed = footprint / requested geometric visibility
```

At 30 m and 60°, requesting 10 s calculates approximately 3.4641 m/s. This request changes speed; it does not directly set the acquisition duration. The engine then recomputes geometric visibility and the capped effective duration from the resulting physical state.

- Changing speed recalculates visibility and effective observation.
- Changing altitude keeps speed fixed, changes footprint and recalculates visibility.
- Changing requested visibility updates speed once, then follows the same normalization path. Derived values are never fed back as a second physical input.
- A visibility request shorter than the minimum feasible dwell time requires more than 12 m/s. The engine clamps speed to 12 m/s and returns the achieved value and an explanation.
- Hover is selected by setting speed to zero. Its geometric visibility is continuous; a finite visibility request produces a positive flyover speed.

The engine exposes `geometry(config)` for the derived quantities and `withVisibility(config, requestedSeconds)` for the inverse operation. The latter returns `{ config, requestedVisibilityTime, clamped, reason }`, allowing the interface to explain a constrained request without claiming it was achieved exactly.

## Compatibility and stress suites

The legacy `config.observation` field remains in normalized configurations and results as a compatibility alias for **effective observation time**. Its meaning has changed: input values are ignored and the field is always derived from altitude, speed, FOV and cap. A legacy configuration containing `altitude: 30`, `speed: 12`, `observation: 30` therefore receives approximately 2.89 s of effective observation with default FOV/cap, rather than an impossible 30-second central flyover.

The `visibility` stress preset and its legacy `observation` alias request 30, 20, 10, 5, 3 and 2 seconds. These durations are converted into feasible speeds with the inverse calculation; they cannot override physical dwell time. A clamped request can therefore produce the same achieved configuration as another level. Other presets and automatic suites also normalize every generated configuration. All presets preserve the selected FOV and observation cap unless those values are explicitly configured by a caller.

Matched Model A/B comparisons use identical altitude, speed, FOV, cap, domain, sensor, lighting, stress settings and seed. Each run carries its own normalized geometry. A speed or visibility sweep changes motion stability as well as dwell time; an altitude sweep changes target scale as well as footprint. Such sweeps demonstrate a physical trade-off, rather than isolating one statistical cause.

Synthetic JSON reports use schema version `2.0.0` to identify these changed configuration semantics and added geometry fields. The imported-prediction schema is unchanged. Older exported results remain records of the version that created them. The application does not migrate old recorded scores or claim that v0.2 scores are numerically identical to v0.3.0 results.

## Synthetic detection integration

The acquisition condition uses `effectiveObservationTime`. A synthetic person must have sufficient model confidence and an acquisition time within the available observation interval to be marked detected.

The previous short-observation and fast/brief-exposure difficulty factors were removed. Reduced geometric visibility is applied through the available-time gate, instead of also becoming an independent visibility-duration penalty. Speed still has a separate illustrative effect on stability/acquisition and clutter. Altitude still affects apparent target scale. Occlusion, smoke, fog, lighting and sensor behaviour keep their distinct synthetic effects.

This separation prevents duplicate penalties for the same reduction in dwell time. It does not make the retained coefficients empirically valid. More time cannot recover a target below the confidence threshold; hovering does not guarantee detection. Higher altitude can increase dwell time while reducing apparent target size.

The moving scan line is a compressed demonstration animation. Its pace follows speed, but its wall-clock duration is not the physical dwell-time calculation. Pause freezes the preview; the scoring configuration and calculated observation duration are unchanged.

## Reports and interpretation

Synthetic reports, session history and JSON/CSV exports record the flight parameters and derived observation geometry alongside the detection results. They retain the first tested non-pass and its failed acceptance criteria. That is a boundary among the sampled configurations, not a calibrated continuous limit.

The report includes this model note:

> Observation geometry is based on a simplified nadir camera model and central straight-line flyover. It does not account for gimbal tracking, off-centre target trajectories or real camera calibration.

Imported prediction evaluation continues to match external boxes against a fixed reference image. It does not acquire video, measure latency or establish a trajectory, so it cannot verify the observation-time assumptions or claim a temporal detection result.

## Physical limits and future extensions

The model assumes flat ground, constant height and speed, a stationary target on the central flight path, a vertical camera and no active gimbal tracking. Terrain slope, camera orientation, acceleration, off-centre paths, target motion and actual occlusion can change dwell time. Geometric inclusion in the frame does not establish unobscured visibility or detectability.

The existing image zoom, blur and environmental effects remain educational visual representations. They are not a calibrated projection, an optical measurement, a ground-sampling-distance estimate or a reproduction of real recorded flight behaviour. The diagram illustrates the ground footprint and effective travel distance; it does not assert an operational flight path.

Future integration may add verified optical parameters and zoom, camera orientation, gimbal tracking, ground sampling distance, frame rate, target position and movement, image motion/stabilization and measured detection latency. The configurable FOV is an extension point for verified equipment data; those additions are not implemented or implied by this release.
