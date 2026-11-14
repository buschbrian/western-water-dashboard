# ADR-166: Offer terminal lakes in the page navigation

- Status: Proposed
- Date: 2026-11-14
- Extends: ADR-119 (terminal-lakes page), ADR-148 (compact page links)
- Supersedes: ADR-119's navigation clause only, on acceptance

## Context

ADR-119 deferred a navigation entry while only Walker Lake was published.
ADR-159 and PR #138 added Great Salt Lake with separately measured arms.
Readers now need the same direct route to this page as to river flow.
PR #133 also implements arms, but that alternate schema duplicates the
contract already merged on main. Only its remaining navigation work is needed.

## Decision

Offer Terminal lakes in the page menu and a compact Lakes link in the wide
navigation bar. Use the shared page-link table and the absolute-elevation
icon, with the icon's three sizes committed locally. The current page is
marked in the menu and omitted from the bar, as for the other pages.

Keep ADR-159's roster, payload, validators, carry-forward and lake rendering.
No data source, measurement, schema or reservoir rollup changes here.

## Rejected alternatives

- Keep lakes accessible only from methods and data: readers must know where
  the page is hidden even though it now contains two lakes.
- Merge PR #133's alternate lake schema: two payloads called version 2 would
  describe different shapes and replace the contract already on main.
- Always show the full link label: the navigation clips at intermediate widths.

## Consequences

Navigation gains one compact entry. Browser checks measure the storage map's
widest bar at 1024 and 1280 pixels and check the menu at phone widths, the
current-page mark, local icon loading and accessibility. Accepted ADR-119's
navigation clause is superseded only after this proposal is accepted.
