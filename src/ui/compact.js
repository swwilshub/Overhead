// One definition of a "compact" screen for the whole interface: a phone in portrait or landscape (specs 007 to 009).
export const COMPACT_QUERY = '(max-width: 700px), (max-height: 500px)';
export const compactMq = window.matchMedia(COMPACT_QUERY);
export const isCompact = () => compactMq.matches;
