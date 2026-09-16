import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { ChipColor, ChipColorId, VisionCountResponse, VisionStackDetection } from '../shared/types.js';

/**
 * AI chip-stack counting: sends the buy-in/cash-out photo to Claude's
 * vision model and asks it to find and count every individual stack. This
 * is meaningfully more accurate than the on-device pixel heuristic
 * (client/src/cv/chipCounter.ts) — it isn't fooled by lighting, angle, or
 * two same-color stacks touching — but needs ANTHROPIC_API_KEY configured
 * and a network round trip, so the client falls back to the on-device
 * heuristic if this throws.
 *
 * Like every other detected count in this app, the result is only ever a
 * *suggestion*: the player still confirms it on an editable screen, and the
 * server always recomputes totalCents from the confirmed counts, never
 * from anything this module returns.
 */

export class ChipVisionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new ChipVisionError('AI chip counting is not configured on this server.', 503);
  }
  client ??= new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new ChipVisionError('That photo could not be read.', 400);
  return { mediaType: match[1]!, base64: match[2]! };
}

const TOOL_NAME = 'report_chip_counts';

function buildTool(paletteIds: string[]) {
  return {
    name: TOOL_NAME,
    description: 'Reports every individual poker chip stack found in the photo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stacks: {
          type: 'array',
          description:
            'One entry per physical stack of chips visible in the photo — a single loose chip counts as a stack of 1. List every stack separately, even two stacks of the same color standing side by side; never merge them into one entry.',
          items: {
            type: 'object',
            properties: {
              colorId: { type: 'string', enum: paletteIds, description: 'Which palette color this stack is.' },
              count: { type: 'integer', minimum: 0, description: 'Number of chips in this one stack, counted individually via the rim lines up its side.' },
              xMinPct: { type: 'number', minimum: 0, maximum: 100, description: "Stack's left edge, as % of photo width from the left." },
              yMinPct: { type: 'number', minimum: 0, maximum: 100, description: "Stack's top edge, as % of photo height from the top." },
              xMaxPct: { type: 'number', minimum: 0, maximum: 100, description: "Stack's right edge, as % of photo width from the left." },
              yMaxPct: { type: 'number', minimum: 0, maximum: 100, description: "Stack's bottom edge, as % of photo height from the top." },
            },
            required: ['colorId', 'count', 'xMinPct', 'yMinPct', 'xMaxPct', 'yMaxPct'],
          },
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Your overall confidence in these counts — "low" if chips are heavily obscured, stacked very unevenly, or the photo is blurry/dark.',
        },
      },
      required: ['stacks', 'confidence'],
    },
  };
}

function paletteDescription(palette: ChipColor[]): string {
  return palette.map((c) => `- id "${c.id}": ${c.label}, chip color ${c.hex}, worth $${(c.valueCents / 100).toFixed(2)} each`).join('\n');
}

function isToolUseBlock(block: unknown): block is { type: 'tool_use'; name: string; input: unknown } {
  return typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'tool_use';
}

export async function countChipsWithAI(photoDataUrl: string, palette: ChipColor[]): Promise<VisionCountResponse> {
  if (palette.length === 0) return { counts: {}, stacks: [], confidence: 'low' };
  const { mediaType, base64 } = parseDataUrl(photoDataUrl);
  const anthropic = getClient();
  const paletteIds = palette.map((c) => c.id);

  const message = await anthropic.messages.create({
    model: config.chipVisionModel,
    max_tokens: 4096,
    tools: [buildTool(paletteIds)],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 },
          },
          {
            type: 'text',
            text:
              `This is a photo of poker chips stacked by color for a home game buy-in. The table's chip colors are:\n${paletteDescription(palette)}\n\n` +
              'Find every stack in the photo. For each one: identify which palette color it matches, then count its chips one by one by the rim lines visible up its side — do not just estimate from height, since stacks are often uneven or photographed at a slight angle. List every stack separately, even same-color stacks standing next to each other.',
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find(isToolUseBlock) as { type: 'tool_use'; name: string; input: unknown } | undefined;
  if (!toolUse) throw new ChipVisionError('The AI counter did not return a result — try again.', 502);

  const input = toolUse.input as { stacks?: unknown[]; confidence?: string };
  const validIds = new Set(paletteIds);
  const counts: Record<ChipColorId, number> = {};
  for (const id of paletteIds) counts[id] = 0;

  const clampPct = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback);

  const stacks: VisionStackDetection[] = [];
  for (const raw of input.stacks ?? []) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as Record<string, unknown>;
    const colorId = typeof s.colorId === 'string' ? s.colorId : '';
    if (!validIds.has(colorId)) continue;
    const count = typeof s.count === 'number' && Number.isFinite(s.count) ? Math.max(0, Math.round(s.count)) : 0;
    if (count <= 0) continue;

    counts[colorId] = (counts[colorId] ?? 0) + count;
    stacks.push({
      colorId,
      count,
      box: {
        xMinPct: clampPct(s.xMinPct, 0),
        yMinPct: clampPct(s.yMinPct, 0),
        xMaxPct: clampPct(s.xMaxPct, 100),
        yMaxPct: clampPct(s.yMaxPct, 100),
      },
    });
  }

  const confidence = input.confidence === 'high' || input.confidence === 'medium' || input.confidence === 'low' ? input.confidence : 'medium';
  return { counts, stacks, confidence };
}
