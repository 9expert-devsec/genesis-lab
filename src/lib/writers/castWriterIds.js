import mongoose from 'mongoose';
import { INVALID_WRITER_ID_MESSAGE, dedupeIds } from './articleWriters.js';

const HEX_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Writer ids as ObjectIds for storage, in order, each once.
 *
 * Throws on a bad id. relatedArticles drops one quietly, which is fine for a
 * suggestion list; here it would change whose article this is. HEX_ID rather
 * than mongoose.isValidObjectId, which also accepts any 12-character string.
 */
export function castWriterIds(ids) {
  return dedupeIds(ids).map((id) => {
    if (!HEX_ID.test(id)) throw new Error(INVALID_WRITER_ID_MESSAGE);
    return new mongoose.Types.ObjectId(id);
  });
}
