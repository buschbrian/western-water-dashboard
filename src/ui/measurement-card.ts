/*
 * A measurement card's elements: heading, the current value with what it is
 * measured above, then labelled rows. Shared by the terminal-lakes page and
 * the reservoir page's surface level (ADR-135); the words are the model's.
 */
import type { MeasurementRow, MeasurementView } from "../measurement-model";

export function definitionList(rows: readonly MeasurementRow[],
  className = "detail-rows"): HTMLDListElement {
  const dl = document.createElement("dl");
  dl.className = className;
  for (const row of rows) {
    const term = document.createElement("dt");
    term.textContent = row.label;
    const definition = document.createElement("dd");
    definition.textContent = row.value;
    dl.append(term, definition);
  }
  return dl;
}

export function measurementCard(view: MeasurementView, headingTag: "h2" | "h3",
  headingClass: string): HTMLElement {
  const card = document.createElement("section");
  const heading = document.createElement(headingTag);
  heading.className = headingClass;
  heading.textContent = view.heading;
  card.append(heading);
  const headline = document.createElement("p");
  headline.className = "detail-headline";
  const value = document.createElement("strong");
  value.textContent = view.headline;
  const basis = document.createElement("span");
  basis.textContent = view.basis;
  headline.append(value, basis);
  card.append(headline, definitionList(view.rows));
  return card;
}
