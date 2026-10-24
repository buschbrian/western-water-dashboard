# Draft report: `calcite-slider` handle has no accessible name

Where to file: the Calcite Design System repository on GitHub
(Esri/calcite-design-system), which is public. Search for an existing issue
first. Not filed yet.

## Summary

`calcite-slider`'s focusable handle (`div[role="slider"][tabindex="0"]` in the
shadow root) has `aria-valuenow`, `aria-valuemin` and `aria-valuemax` but no
accessible name. Neither the documented `label` property nor an `aria-label`
on the host reaches it. axe-core reports `aria-input-field-name`. Seen on
`@esri/calcite-components` 5.1.2.

## Steps to reproduce

```html
<calcite-slider label="Day shown" min="1" max="100" value="10"></calcite-slider>
<script type="module">
  const slider = document.querySelector("calcite-slider");
  await slider.componentOnReady();
  const handle = slider.shadowRoot.querySelector('[role="slider"]');
  console.log(handle.getAttribute("aria-label")); // null
</script>
```

Repeat with `aria-label="Day shown"` on the host: still null.

## Suggested fix

Apply `label` (and the host's `aria-label`, if present) to the handle as
`aria-label`, or point `aria-labelledby` at an internal label element. For
range sliders, name each handle (`minLabel` / `maxLabel`).

`calcite-switch` appears to have the same gap when named through a wrapping
label (our register E13); worth checking together.

## Our workaround

`src/ui/slider-label.ts` writes `aria-label` onto any unnamed handle inside
the open shadow root, and only when the handle has no name, so a fixed
Calcite takes over without a code change.
