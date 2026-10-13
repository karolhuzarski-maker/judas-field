# JUDAS FIELD — imported prediction schema

The **Evaluate your model** workflow measures person boxes that you produced elsewhere. It does not run a model, change predictions, use synthetic simulator scores, or send files to a server. Files and results remain in the current browser tab and are discarded when it closes or reloads.

The reference images are synthetic examples with public annotations. Scores on these few examples do not establish real-world accuracy, clinical usefulness, or independent blind validation.

## Workflow

1. Select MCI, TCCC, or SAR and the RGB or synthetic thermal reference.
2. Download the original reference image from the evaluation panel. Run your own detector on this image outside JUDAS FIELD.
3. Convert its **person** predictions to the JSON or CSV schema below. Keep the exact scenario identifier and sensor. Undo resizing, padding, or cropping before normalizing your boxes to the original image.
4. Import set A. Optionally import a second detector's predictions as set B for the **same image and sensor**.
5. Set confidence and IoU thresholds, then evaluate. Both sets use identical scoring rules. Inspect detections, misses, duplicate detections, and false positives. Export JSON or CSV, or print the report to PDF.

The downloadable example in the application is generated directly from the selected scenario manifest. It deliberately copies the reference boxes and uses confidence 0.9 to demonstrate the file format. It is **not a detector output or a performance claim**.

## Coordinate convention

`coordinate_system` is exactly **`normalized_xywh`**. Each box is `[x, y, width, height]`:

- `x` and `y` are the box's **top-left** corner, measured from the original image's top-left.
- Divide horizontal pixel measurements by the image width, and vertical measurements by the image height.
- All four values must be finite numbers between 0 and 1. Width and height must be positive. The right and bottom edges must not extend outside the image.
- These are not center coordinates, percentages, pixels, or `[x1, y1, x2, y2]` boxes.
- Image and overlay share one SVG viewbox, so resizing preserves their alignment. Imported evaluation always uses the full, unmodified reference image. Simulator stress settings do not apply to it.

Reference boxes follow the scenario manifest's annotation policy: **visible body extent with a small margin**, excluding shadows and without estimating anatomy hidden by vegetation or cover. If your detector predicts full-body boxes behind occlusion, account for that annotation-policy difference when interpreting IoU.

Example conversion: a pixel box at `(320, 180)`, size `80 × 135`, in a `1600 × 900` image becomes `[0.2, 0.2, 0.05, 0.15]`.

## JSON

The top level must contain exactly these fields:

```json
{
  "schema_version": "judas-predictions-v1",
  "scenario_id": "mci-v02",
  "coordinate_system": "normalized_xywh",
  "sensor": "RGB",
  "model_name": "My person detector",
  "predictions": [
    {
      "id": "prediction-001",
      "bbox": [0.2, 0.2, 0.05, 0.15],
      "confidence": 0.87,
      "class": "person"
    }
  ]
}
```

The box above is only a syntax example, not a reference annotation. Download the scenario-specific example from the application for boxes aligned to the actual image.

| Field | Requirement |
| --- | --- |
| `schema_version` | Exactly `judas-predictions-v1` |
| `scenario_id` | `mci-v02`, `tccc-v02`, or `sar-v02`; must match the selected manifest |
| `coordinate_system` | Exactly `normalized_xywh` |
| `sensor` | Exactly `RGB` or `THERMAL`; must match the selected reference |
| `model_name` | Nonempty text, at most 160 characters, no control characters |
| `predictions` | Array of 0–2,000 predictions |
| Prediction `id` | Unique, nonempty text, at most 100 characters, no control characters |
| Prediction `bbox` | Four normalized numbers, as described above |
| Prediction `confidence` | Finite numeric value from 0 to 1, supplied by the external detector |
| Prediction `class` | Exactly `person` |

An empty `predictions: []` is a valid output. It produces zero TP and FP, and all reference people are FN. Numeric strings, missing fields, extra fields, duplicate IDs, unknown classes, or coordinates outside the image are rejected. Confidence is taken as supplied; JUDAS FIELD does not verify or calibrate it.

## CSV

UTF-8 CSV is accepted, including a BOM, CRLF line endings, and correctly quoted fields with escaped quotes. Use this exact set of column names, in any order:

```csv
schema_version,scenario_id,coordinate_system,sensor,model_name,id,x,y,width,height,confidence,class
judas-predictions-v1,mci-v02,normalized_xywh,RGB,My person detector,prediction-001,0.2,0.2,0.05,0.15,0.87,person
```

Every row must repeat the same first five metadata fields. Numbers must use a decimal point, without thousands separators. A file describes one model on one sensor image; mixed metadata is rejected.

For a valid **empty prediction set**, include one metadata row with all seven prediction fields empty:

```csv
schema_version,scenario_id,coordinate_system,sensor,model_name,id,x,y,width,height,confidence,class
judas-predictions-v1,mci-v02,normalized_xywh,RGB,My person detector,,,,,,,
```

Files are capped at **2 MiB** and **2,000 predictions** to keep browser evaluation responsive. Rejected files do not receive scores. Filenames and model names are displayed as text, not executable HTML.

## Matching and metrics

Default confidence threshold: **0.25**. Default intersection over union (IoU) threshold: **0.50**. The report records the thresholds actually used.

1. Exclude predictions with `confidence < confidence_threshold`. A prediction exactly at the threshold is retained.
2. Sort the remaining predictions by descending confidence. Equal-confidence predictions keep their original input order.
3. For each prediction, calculate IoU against every unmatched reference box. IoU is intersection area divided by union area.
4. Match to the unmatched reference with the largest IoU that is **at least** the selected IoU threshold. Equal-IoU reference candidates keep manifest order.
5. A matched prediction is **TP**. Each reference can match only once. A retained prediction with no available qualifying match, including a duplicate detection of an already matched person, is **FP**.
6. Each reference left unmatched is **FN**. Predictions below threshold are reported separately and do not count as FP.

This is a documented confidence-first greedy, one-to-one matching rule; it is not a maximum-cardinality global assignment or a COCO mAP implementation. Changing the threshold may change which prediction claims a reference.

**Precision = TP / (TP + FP)**, defined as 0 when no predictions remain. **Recall = TP / (TP + FN)**, defined as 0 if there are no reference targets. This demonstration's three scenarios have annotated reference subjects.

The JSON report contains every prediction, ignored prediction, reference outcome, match, IoU, threshold, image identity, and provenance. The CSV report contains a summary plus reference and prediction audit rows, including ignored boxes. The screen shows at most 100 prediction audit rows per set; exports include all. Exported CSV text that might be interpreted as a spreadsheet formula is prefixed with an apostrophe.

## Comparison, reporting, and limitations

Sets A and B must use the same scenario and sensor. Both are scored independently against the same references with the same confidence and IoU thresholds. The report gives each set's metrics and the differences, **B minus A**. Model labels are user-supplied; the software does not certify their identity.

These are fixed-image evaluation results, separate from the synthetic model profiles used by the test bench. No degradation curve, failure boundary, or operational reliability is inferred from one image. Subject annotations are manually reviewed demonstration annotations, not a statistically representative corpus. Synthetic thermal images are illustrative and not calibrated radiometric measurements.

For further validation, inspect false positives and missed targets; collect a larger, held-out dataset across sensors, terrain, light, occlusion, and motion; verify annotations and registration; and report uncertainty. Blind benchmarking remains planned: this public client-side application reveals its ground truth and scoring.
