// =============================================================================
// A `pmtiles` Source backed by a Blob held in IndexedDB. This is what lets a
// single Leaflet map render offline vector tiles: we download a .pmtiles archive
// once, keep the Blob in IndexedDB, and serve byte ranges from it locally — no
// tile server, no network, no API key.
// =============================================================================

/**
 * Implements the pmtiles `Source` interface:
 *   getKey(): string
 *   getBytes(offset, length): Promise<{ data: ArrayBuffer }>
 * Byte ranges are read locally via Blob.slice() — fast and fully offline.
 */
export class IDBBlobSource {
  /** @param {Blob} blob @param {string} key stable cache key (e.g. country) */
  constructor(blob, key) {
    this.blob = blob;
    this._key = key;
  }

  getKey() {
    return this._key;
  }

  async getBytes(offset, length) {
    const slice = this.blob.slice(offset, offset + length);
    const data = await slice.arrayBuffer();
    return { data };
  }
}
