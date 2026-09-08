/** Preserve PostgreSQL's original whole-array spelling for constant varchar casts. */
export function normalizePostgresLiteralTextArrayCasts(definition) {
  // Skip quoted content. Expressions, escaped literals, and typmods stay exact.
  return definition.replace(
    /[eE]'(?:\\.|''|[^'\\])*'|'(?:''|[^'])*'|"(?:""|[^"])*"|(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?\1|ARRAY\[((?:\('[^']*'::character varying\)::text)(?:, \('[^']*'::character varying\)::text)*)\]/g,
    (match, _dollarQuote, elements) =>
      elements === undefined
        ? match
        : `(ARRAY[${elements.replace(/\(('[^']*'::character varying)\)::text/g, '$1')}])::text[]`
  );
}
