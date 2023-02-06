import { Query, argmax, argmin, expr, max, min, epoch_ms } from '@uwdata/mosaic-sql';
import { filteredExtent } from './util/extent.js';
import { Mark } from './Mark.js';

export class ConnectedMark extends Mark {
  constructor(type, source, encodings) {
    super(type, source, encodings);
    this.dim = type.endsWith('X') ? 'y' : 'x';
  }

  query(filter = []) {
    const { plot, dim, source, stats } = this;
    const { optimize = true } = source.options || {};
    const q = super.query(filter);

    if (optimize) {
      // TODO: handle stacked data
      const { column } = this.channelField(dim);
      const { rows, type, min, max } = stats.find(s => s.column === column);
      const size = dim === 'x' ? plot.innerWidth() : plot.innerHeight();

      const [lo, hi] = filteredExtent(filter, column) || [min, max];
      const scale = (hi - lo) / (max - min);
      if (rows * scale > size * 4) {
        const dd = type === 'date' ? epoch_ms(dim) : dim;
        const val = dim === 'x' ? 'y' : 'x';
        const cols = q.select().map(c => c.as).filter(c => c !== 'x' && c !== 'y');
        return m4(q, dd, dim, val, lo, hi, size, cols);
      }
    }

    return q.orderby(dim);
  }
}

function m4(input, bx, x, y, lo, hi, width, cols = []) {
  const bins = expr(`FLOOR(${width / (hi - lo)}::DOUBLE * (${bx} - ${+lo}::DOUBLE))`);

  const q = (sel) => Query
    .from(input)
    .select(sel)
    .groupby(bins, cols);

  return Query
    .union(
      q([{ [x]: min(x), [y]: argmin(y, x) }, ...cols]),
      q([{ [x]: max(x), [y]: argmax(y, x) }, ...cols]),
      q([{ [x]: argmin(x, y), [y]: min(y) }, ...cols]),
      q([{ [x]: argmax(x, y), [y]: max(y) }, ...cols])
    )
    .orderby(cols, x);
}