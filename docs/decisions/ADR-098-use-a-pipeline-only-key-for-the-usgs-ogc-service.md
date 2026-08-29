# ADR-098: Use a pipeline-only key for the USGS OGC service

- Status: Accepted
- Date: 2026-08-29

## Context

ADR-080 admitted seven U.S. Geological Survey reservoir series through the
keyless legacy daily-values service and named its early-2027 retirement as
debt. The modern OGC daily collection preserves the site numbers and parameter
00054, but sustained use requires an API key. One admitted site also exposes
two daily statistics, so selecting a series by response order would make the
migration capable of changing a published value silently.

ADR-004 rejects credentials on public pages because a browser cannot keep a
secret and an ArcGIS challenge can block the page. The morning pipeline is a
different trust boundary: it already runs in GitHub Actions, commits reviewed
outputs, and never sends its environment to a reader.

## Decision

Use the modern U.S. Geological Survey OGC daily-values collection. Store its
key only as the `USGS_API_KEY` Actions secret and send it in the `X-Api-Key`
header. Never place it in a request URL, generated payload, log, or browser.

Commit the reviewed daily statistic beside each admitted station. The provider
requests the site, parameter, statistic and date interval explicitly, follows
OGC `next` links, and accepts only acre-feet rows that repeat those identifiers.

Before changing the production source, compare the legacy and OGC series for
all seven admitted stations. Missing credentials and provider failures follow
the existing carry-forward rules; they do not produce a partial replacement.

## Rejected alternatives

- Withdraw the seven stations when the legacy service retires. This discards
  current, defensible observations to avoid a secret the public page never
  receives.
- Put the key in a query parameter. The service permits this, but URLs are
  routinely logged and copied.
- Select the first or last statistic returned. OGC feature order is not the
  identity of a time series, and Weber Reservoir exposes two statistics.

## Consequences

The public dashboard remains anonymous and keeps ADR-004's refusal of browser
credential challenges. Repository fixtures and ordinary tests remain keyless.
A live USGS refresh now requires one Actions secret, and a missing secret is
visible as a provider failure while the last verified records remain.

This record supersedes ADR-080 and narrows ADR-004 only for credentials held by
the non-public data pipeline.
