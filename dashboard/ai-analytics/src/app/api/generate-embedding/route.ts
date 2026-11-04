// dashboard/ai-analytics/src/app/api/generate-embedding/route.ts
import { NextResponse } from 'next/server';
import { pipeline } from '@xenova/transformers';
import type { FeatureExtractionPipeline } from '@xenova/transformers/types/pipelines';

// Cache the model to avoid reloading it for every request
let embeddingPipeline: FeatureExtractionPipeline | null = null;

const MAX_TEXT_LENGTH = 1000;

async function getEmbeddingModel() {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as FeatureExtractionPipeline;
  }
  return embeddingPipeline;
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input: text must be a non-empty string' },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Invalid input: text must be at most ${MAX_TEXT_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Get the model
    const model = await getEmbeddingModel();
    
    // Generate embedding
    const output = await model(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    
    return NextResponse.json({ embedding });
  } catch (error) {
    console.error('Error generating embedding:', error);
    return NextResponse.json(
      { error: 'Failed to generate embedding' },
      { status: 500 }
    );
  }
}