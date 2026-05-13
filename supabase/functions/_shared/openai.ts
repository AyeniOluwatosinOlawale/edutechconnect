// OpenAI API client — embeddings (text-embedding-3-small) + GPT-4o chat completions

const OPENAI_API = 'https://api.openai.com/v1'

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}`,
  }
}

export async function createEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OPENAI_API}/embeddings`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8192),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embeddings error (${res.status}): ${err}`)
  }
  const json = await res.json()
  return json.data[0].embedding as number[]
}

// Create embeddings for multiple texts in batches of 10 to avoid rate limits
export async function createEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const batchSize = 10
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embeddings = await Promise.all(batch.map(createEmbedding))
    results.push(...embeddings)
  }
  return results
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionResult {
  content: string
  prompt_tokens: number
  reply_tokens: number
}

export async function chatCompletion(params: {
  systemPrompt: string
  userMessage: string
  context: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}): Promise<ChatCompletionResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: params.systemPrompt },
    // Last 3 turns of conversation history (6 messages)
    ...params.history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: `Knowledge base context:\n${params.context}\n\nVisitor question:\n${params.userMessage}`,
    },
  ]

  const res = await fetch(`${OPENAI_API}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      max_tokens: params.maxTokens ?? 512,
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI chat error (${res.status}): ${err}`)
  }

  const json = await res.json()
  return {
    content: json.choices[0].message.content as string,
    prompt_tokens: json.usage.prompt_tokens as number,
    reply_tokens: json.usage.completion_tokens as number,
  }
}

// Sentinel phrases that indicate the LLM wants to escalate even when similarity is ok
export const ESCALATION_PHRASES = [
  "connect you with a human agent",
  "transfer you to a human",
  "i don't have that information",
  "i cannot help with that",
  "i'm not able to answer",
  "please contact our support team",
]

export function llmWantsEscalation(reply: string): boolean {
  const lower = reply.toLowerCase()
  return ESCALATION_PHRASES.some((p) => lower.includes(p))
}
