import { z } from 'zod';

export const RectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const ClickStepSchema = z.object({
  id: z.string(),
  type: z.literal('click'),
  assetId: z.string(),
  instruction: z.string(),
  hotspots: z.array(z.object({
    id: z.string(),
    rect: RectSchema,
    nextStepId: z.string()
  })),
  hint: z.string().optional()
});

export const InputStepSchema = z.object({
  id: z.string(),
  type: z.literal('input'),
  assetId: z.string(),
  instruction: z.string(),
  input: z.object({
    mode: z.string(),
    placeholder: z.string().optional(),
    acceptedValues: z.array(z.string()),
    storeInput: z.boolean().default(false)
  }),
  nextStepId: z.string(),
  hint: z.string().optional()
});

export const ChoiceStepSchema = z.object({
  id: z.string(),
  type: z.literal('choice'),
  assetId: z.string(),
  instruction: z.string(),
  choices: z.array(z.object({
    label: z.string(),
    nextStepId: z.string()
  })),
  hint: z.string().optional()
});

export const StepSchema = z.discriminatedUnion('type', [
  ClickStepSchema,
  InputStepSchema,
  ChoiceStepSchema
]);

export type Step = z.infer<typeof StepSchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string(),
  version: z.string(),
  title: z.string(),
  notice: z.string(),
  mode: z.string(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
    dpr: z.number()
  }),
  startStepId: z.string(),
  assets: z.record(z.string()),
  steps: z.array(StepSchema)
});

export type Manifest = z.infer<typeof ManifestSchema>;

export function validateManifest(data: unknown): Manifest {
  return ManifestSchema.parse(data);
}
