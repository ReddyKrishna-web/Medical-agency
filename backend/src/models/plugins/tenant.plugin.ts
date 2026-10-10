import type { Schema } from 'mongoose';

export interface TenantPluginOptions {
  /** Extra compound indexes merged with the mandatory `{ agencyId: 1 }` index. */
  indexes?: Record<string, 1 | -1>[];
  /** Fields included in the tenant-scoped text search index. */
  textWeights?: Record<string, number>;
}

/**
 * Mongoose's `PluginFunction` is invariant in the document type, so the plugin is
 * declared structurally with a loose schema parameter and typed at the boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TenantPlugin = (schema: any, options?: any) => void;

/**
 * Every business model is a tenant model. This plugin guarantees:
 *  - an `agencyId` (ObjectId, required, indexed) and a `{ agencyId, createdAt }` index
 *  - an optional tenant-scoped text index used by global search
 *  - a guard that rejects a document without an `agencyId`
 */
export const tenantPlugin: TenantPlugin = (input, options) => {
  const schema = input as Schema;
  const config = (options ?? {}) as TenantPluginOptions;

  if (!schema.path('agencyId')) {
    throw new Error('tenantPlugin requires an agencyId path on the schema');
  }

  schema.index({ agencyId: 1, createdAt: -1 });
  for (const index of config.indexes ?? []) {
    schema.index(index);
  }

  const textFields = Object.keys(config.textWeights ?? {});
  if (textFields.length > 0) {
    schema.index(
      { agencyId: 1, ...Object.fromEntries(textFields.map((field) => [field, 'text'])) },
      {
        name: 'agency_text_search',
        weights: config.textWeights
      }
    );
  }

  schema.pre('validate', function enforceTenant(next: (error?: Error) => void): void {
    if (!this.get('agencyId')) {
      this.invalidate('agencyId', 'agencyId is required (tenant scoping)');
    }
    next();
  });
};

/**
 * Standard JSON shape for a document: keep `_id`, add a string `id` alias and
 * drop the internal `__v`. The response layer normalises lean results the same way.
 */
export const documentJsonTransform = (_doc: unknown, ret: Record<string, unknown>): Record<string, unknown> => {
  if (ret._id !== undefined) {
    ret.id = String(ret._id);
  }
  delete ret.__v;
  return ret;
};

/** Register a `toJSON` transform without fighting mongoose's option typing. */
export const applyJsonTransform = (
  schema: Schema,
  options?: { virtuals?: boolean; transform?: (doc: unknown, ret: Record<string, unknown>) => unknown }
): void => {
  (schema.set as (key: string, value: unknown) => void)('toJSON', {
    ...(options?.virtuals ? { virtuals: true } : {}),
    transform: options?.transform ?? documentJsonTransform
  });
};
