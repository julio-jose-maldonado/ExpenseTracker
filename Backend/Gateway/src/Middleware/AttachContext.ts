import { randomUUID } from 'node:crypto';
import { REQUEST_ID_METADATA_KEY, runWithRequestId } from '@expense-tracker/core';
import type { RequestHandler } from 'express';

// Solo se acepta un request id con formato seguro (evita inyección en logs).
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export const attachContext: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_METADATA_KEY);
  const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_METADATA_KEY, requestId);
  runWithRequestId(requestId, () => next());
};
