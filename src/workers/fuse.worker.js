import Fuse from 'fuse.js';
import names from '../constants/names.json';

const fuse = new Fuse(names, { includeScore: true, threshold: 0.25, keys: ['name'] });

self.onmessage = (ev) => {
  const { id, term } = ev.data || {};
  if (!term) {
    self.postMessage({ id, results: [] });
    return;
  }

  try {
    const r = fuse.search(term || '');
    const results = r.map(res => res.item);
    self.postMessage({ id, results });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
