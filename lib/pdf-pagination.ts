export type PageSlice = { start: number; end: number };

/** Keep a document boundary near the bottom of each page when one is available. */
export function planPageSlices(totalHeight: number, pageHeight: number, breakpoints: number[]): PageSlice[] {
  if (!Number.isFinite(totalHeight) || !Number.isFinite(pageHeight) || totalHeight <= 0 || pageHeight <= 0) return [];

  const points = [...new Set(breakpoints.filter((point) => Number.isFinite(point) && point > 0 && point < totalHeight).map(Math.round))]
    .sort((a, b) => a - b);
  const slices: PageSlice[] = [];
  let start = 0;

  while (start < totalHeight) {
    const limit = Math.min(totalHeight, start + pageHeight);
    if (limit === totalHeight) {
      slices.push({ start, end: totalHeight });
      break;
    }

    // An early break wastes most of a page, so use a regular slice instead.
    const earliest = start + pageHeight * 0.55;
    const boundary = points.findLast((point) => point >= earliest && point <= limit - 4);
    const end = boundary ?? limit;
    slices.push({ start, end });
    start = end;
  }

  return slices;
}

/** Map visible section/item/line starts to the captured canvas coordinate system. */
export function collectPageBreakpoints(paper: HTMLElement, canvasHeight: number): number[] {
  const paperRect = paper.getBoundingClientRect();
  if (paperRect.height <= 0) return [];
  const scale = canvasHeight / paperRect.height;
  const breakpoints: number[] = [];
  const add = (top: number) => {
    const position = Math.round((top - paperRect.top) * scale);
    if (position > 0 && position < canvasHeight) breakpoints.push(position);
  };

  for (const element of paper.querySelectorAll<HTMLElement>(
    ".resume-section, .resume-entry, .resume-entry li, .skill-pills span",
  )) add(element.getBoundingClientRect().top);

  // Long paragraphs and list items can span a page. Their rendered line boxes
  // provide safer fallback cuts than an arbitrary pixel row through the text.
  for (const element of paper.querySelectorAll<HTMLElement>(".resume-section p, .resume-entry li")) {
    const range = document.createRange();
    range.selectNodeContents(element);
    for (const rect of range.getClientRects()) add(rect.top);
  }

  return breakpoints;
}
