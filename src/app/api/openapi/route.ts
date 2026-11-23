import spec from '@/lib/openapi-spec';
import pkg from '../../../../package.json';
import { withApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Replace this project's shorthand `{ $ref: "AnimeCard" }` markers (which are
 * not valid OpenAPI references) with plain object schemas so the document
 * loads cleanly in Swagger UI, Postman, openapi-generator, etc.
 */
function normalise(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalise);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.$ref === 'string' && !obj.$ref.startsWith('#')) {
      return { type: 'object', description: `${obj.$ref} (see src/lib/types.ts)` };
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, normalise(v)]));
  }
  return node;
}

/**
 * GET /api/openapi
 *
 * The OpenAPI 3.0 description of this API as JSON.
 */
async function handler() {
  const doc = normalise({
    openapi: '3.0.3',
    info: { ...spec.info, version: pkg.version },
    servers: [{ url: '/api', description: 'This server' }],
    paths: spec.paths,
  });
  return Response.json(doc);
}

export const GET = withApi(handler);
