/*
 * The map-background gallery, built the first time a reader opens it.
 *
 * Every map on this site keeps the SDK's basemap gallery inside a collapsed
 * `arcgis-expand`. The gallery does its work when it is connected, not when
 * it is shown: it asks the portal for its basemap group and downloads a
 * thumbnail for every entry -- 32 of them, about 1.4 MB from www.arcgis.com
 * -- on every page load, behind a button most readers never press. So the
 * expand is written empty and the gallery is put in it on the first expand.
 *
 * Nothing else about the gallery changes. It still binds to the map it sits
 * in, a pick from it still goes through the basemap-reference and theme
 * guards that watch the map rather than the gallery (ADR-042), and once
 * built it stays, so a second open is as fast as it always was.
 */

/** The part of `arcgis-expand` this needs. Structural, so a unit test can
 * stand in for the component without a browser. */
export interface GalleryExpand extends EventTarget {
  readonly expanded: boolean;
  append(...nodes: Node[]): void;
}

/** Loads the gallery component and makes one element. The component module
 * is imported here, not at the top of the map modules, so its code waits for
 * the same click its network requests now wait for. */
async function createGallery(): Promise<Node> {
  await import("@arcgis/map-components/components/arcgis-basemap-gallery");
  return document.createElement("arcgis-basemap-gallery");
}

/**
 * Puts a basemap gallery into `expand` the first time it is expanded, or at
 * once if it is already expanded. Returns the promise of that one build, so
 * a caller or a test can wait on it; a failed build is logged and left for
 * the next expand to retry, because a gallery that never arrives costs the
 * reader a choice of background and nothing on the map.
 */
export function galleryOnFirstExpand(
  expand: GalleryExpand,
  create: () => Promise<Node> = createGallery
): Promise<void> {
  return new Promise((resolve) => {
    let building = false;
    const build = (): void => {
      if (building) return;
      building = true;
      create().then((gallery) => {
        expand.removeEventListener("arcgisPropertyChange", onChange);
        expand.append(gallery);
        resolve();
      }, (error: unknown) => {
        building = false;
        console.warn("The map background gallery could not be built:", error);
      });
    };
    /* `arcgisPropertyChange` is the expand's only change event, and it names
     * the property; `expanded` is the one it reports today. Read the state
     * from the element rather than trusting the event for it. */
    const onChange = (): void => {
      if (expand.expanded) build();
    };
    expand.addEventListener("arcgisPropertyChange", onChange);
    if (expand.expanded) build();
  });
}
