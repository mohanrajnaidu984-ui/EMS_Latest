Quote column resizing
=====================

Column dragging starts with the rendered column widths, then updates the colgroup and cached cell widths together on each animation frame. The blue guide follows the rendered cell border in viewport coordinates, including preview zoom. When a table reaches the page limit, available width is taken from columns to the right so preceding boundaries do not shift away from the pointer.

Saved custom widths are preserved through export and edit reinitialization, including narrow columns. Internally copied tables also update their stored outer width during a drag so their clipboard layout cannot restore the previous table size. Office table CSS groups its table selectors before appending cell descendants; this prevents cell padding from accidentally being applied to whole tables and changing column geometry in browse mode.

Regression coverage:

- `e2e/quote-column-resize.spec.js`: two tables, shrinking and widening, guide/border/pointer agreement, unchanged upper table, exit and reopen, normal and internally copied tables at 70%, 100%, and 120% zoom.
- Existing table-exit and formatted cell-paste browser tests.
- Quote unit tests and production build.

Verification uses local fixtures and does not alter live quotes.
