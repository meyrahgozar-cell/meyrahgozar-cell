// Auto-generated from the OpenRouter /api/v1/models catalogue.
// Regenerate at runtime with: Settings > Models > Sync (nothing is overwritten here).
export const OR_FREE_MODELS = [
  {
    "id": "baidu/ernie-5.5-flash-preview:free",
    "canonical_slug": "baidu/ernie-5.5-flash-preview-20261110",
    "name": "Baidu: ERNIE-5.5-Flash-Preview (free)",
    "created": 1794333533,
    "description": "ERNIE 5.5 Flash Preview is the latest foundation model in the ERNIE family, with comprehensive improvements in coding, agentic capabilities, knowledge work, and deep research. It has 280 billion total...",
    "context_length": 1024000,
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1024000,
      "max_completion_tokens": 921600,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "reasoning_effort",
      "response_format",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {},
    "hugging_face_id": "baidu/ERNIE-5.5-Flash-Preview",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/baidu/ernie-5.5-flash-preview-20261110/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": true,
      "default_enabled": true,
      "supported_efforts": [
        "high"
      ],
      "default_effort": "high"
    },
    "supported_voices": null,
    "provider": "baidu"
  },
  {
    "id": "deepseek/deepseek-r1:free",
    "name": "DeepSeek R1 (free)",
    "provider": "deepseek",
    "context_length": 163840,
    "max_completion_tokens": 16384,
    "description": "Open reasoning model that exposes chain-of-thought, ideal for score auditing.",
    "supported_parameters": [
      "reasoning",
      "include_reasoning",
      "temperature",
      "top_p",
      "max_tokens"
    ],
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "is_curated": true
  },
  {
    "id": "dots-studio/dots-3-note-preview:free",
    "canonical_slug": "dots-studio/dots-3-note-preview-20260813",
    "name": "Dots Studio: Dots3-Note Preview (free)",
    "created": 1786680361,
    "description": "Dots3-Note Preview is an open-weight mixture-of-experts model from Dots Studio, with 16B active parameters out of 280B total. It is the lightest model in the Dots 3 family and is...",
    "context_length": 512000,
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 512000,
      "max_completion_tokens": 460800,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {},
    "hugging_face_id": "dots-studio/dots3-note-prev",
    "knowledge_cutoff": null,
    "expiration_date": "2026-12-31",
    "links": {
      "details": "/api/v1/models/dots-studio/dots-3-note-preview-20260813/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false
    },
    "supported_voices": null,
    "provider": "dots-studio"
  },
  {
    "id": "openrouter/free",
    "canonical_slug": "openrouter/free",
    "name": "Free Models Router",
    "created": 1769917427,
    "description": "The simplest way to get free inference. openrouter/free is a router that selects free models at random from the models available on OpenRouter. The router smartly filters for models that...",
    "context_length": 200000,
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Router",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": null,
      "max_completion_tokens": null,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "frequency_penalty",
      "include_reasoning",
      "logprobs",
      "max_completion_tokens",
      "max_tokens",
      "min_p",
      "presence_penalty",
      "reasoning",
      "reasoning_effort",
      "repetition_penalty",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_logprobs",
      "top_p"
    ],
    "default_parameters": {
      "temperature": null,
      "top_p": null,
      "frequency_penalty": null
    },
    "hugging_face_id": null,
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/openrouter/free/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": null,
    "supported_voices": null,
    "provider": "openrouter"
  },
  {
    "id": "google/gemini-2.0-flash-exp:free",
    "name": "Gemini 2.0 Flash Exp (free)",
    "provider": "google",
    "context_length": 1048576,
    "max_completion_tokens": 8192,
    "description": "Very large context with fast multimodal input.",
    "supported_parameters": [
      "temperature",
      "top_p",
      "max_tokens",
      "tools"
    ],
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "is_curated": true
  },
  {
    "id": "google/gemma-4-26b-a4b-it:free",
    "canonical_slug": "google/gemma-4-26b-a4b-it-20260403",
    "name": "Google: Gemma 4 26B A4B  (free)",
    "created": 1775227989,
    "description": "Gemma 4 26B A4B IT is an instruction-tuned Mixture-of-Experts (MoE) model from Google DeepMind. Despite 25.2B total parameters, only 3.8B activate per token during inference — delivering near-31B quality at...",
    "context_length": 262144,
    "architecture": {
      "modality": "text+image+video->text",
      "input_modalities": [
        "image",
        "text",
        "video"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Gemma",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 262144,
      "max_completion_tokens": 32768,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {
      "temperature": 1,
      "top_p": 0.95,
      "top_k": 64
    },
    "hugging_face_id": "google/gemma-4-26B-A4B-it",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/google/gemma-4-26b-a4b-it-20260403/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false,
      "default_enabled": false
    },
    "supported_voices": null,
    "provider": "google"
  },
  {
    "id": "google/gemma-4-31b-it:free",
    "canonical_slug": "google/gemma-4-31b-it-20260402",
    "name": "Google: Gemma 4 31B (free)",
    "created": 1775148486,
    "description": "Gemma 4 31B Instruct is Google DeepMind's 30.7B dense multimodal model supporting text and image input with text output. Features a 256K token context window, configurable thinking/reasoning mode, native function...",
    "context_length": 262144,
    "architecture": {
      "modality": "text+image+video->text",
      "input_modalities": [
        "image",
        "text",
        "video"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Gemma",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 262144,
      "max_completion_tokens": 32768,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {
      "temperature": 1,
      "top_p": 0.95,
      "top_k": 64,
      "frequency_penalty": null,
      "presence_penalty": null,
      "repetition_penalty": null
    },
    "hugging_face_id": "google/gemma-4-31B-it",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/google/gemma-4-31b-it-20260402/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false,
      "default_enabled": false
    },
    "supported_voices": null,
    "provider": "google"
  },
  {
    "id": "google/lyria-3-clip-preview",
    "canonical_slug": "google/lyria-3-clip-preview-20260330",
    "name": "Google: Lyria 3 Clip Preview",
    "created": 1774907255,
    "description": "30 second duration clips are priced at $0.04 per clip. Lyria 3 is Google's family of music generation models, available through the Gemini API. With Lyria 3, you can generate...",
    "context_length": 1048576,
    "architecture": {
      "modality": "text+image->text+audio",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text",
        "audio"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1048576,
      "max_completion_tokens": 65536,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "max_tokens",
      "response_format",
      "seed",
      "temperature",
      "top_p"
    ],
    "default_parameters": {
      "temperature": null,
      "top_p": null,
      "top_k": null,
      "frequency_penalty": null,
      "presence_penalty": null,
      "repetition_penalty": null
    },
    "hugging_face_id": null,
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/google/lyria-3-clip-preview-20260330/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": null,
    "supported_voices": null,
    "provider": "google"
  },
  {
    "id": "google/lyria-3-pro-preview",
    "canonical_slug": "google/lyria-3-pro-preview-20260330",
    "name": "Google: Lyria 3 Pro Preview",
    "created": 1774907286,
    "description": "Full-length songs are priced at $0.08 per song. Lyria 3 is Google's family of music generation models, available through the Gemini API. With Lyria 3, you can generate high-quality, 48kHz...",
    "context_length": 1048576,
    "architecture": {
      "modality": "text+image->text+audio",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text",
        "audio"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1048576,
      "max_completion_tokens": 65536,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "max_tokens",
      "response_format",
      "seed",
      "temperature",
      "top_p"
    ],
    "default_parameters": {
      "temperature": null,
      "top_p": null,
      "top_k": null,
      "frequency_penalty": null,
      "presence_penalty": null,
      "repetition_penalty": null
    },
    "hugging_face_id": null,
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/google/lyria-3-pro-preview-20260330/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": null,
    "supported_voices": null,
    "provider": "google"
  },
  {
    "id": "inclusionai/ling-3.2-flash:free",
    "canonical_slug": "inclusionai/ling-3.2-flash-20261113",
    "name": "inclusionAI: Ling 3.2 Flash (free)",
    "created": 1794591958,
    "description": "Ling 3.2 Flash is a hybrid reasoning model from inclusionAI that accepts text and image input, with a 1M-token context window and up to 200 images per request. Thinking can...",
    "context_length": 1048576,
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1048576,
      "max_completion_tokens": 262144,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "frequency_penalty",
      "include_reasoning",
      "max_tokens",
      "presence_penalty",
      "reasoning",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_p"
    ],
    "default_parameters": {},
    "hugging_face_id": "inclusionAI/Ling-3.2-flash",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/inclusionai/ling-3.2-flash-20261113/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false,
      "default_enabled": true
    },
    "supported_voices": null,
    "provider": "inclusionai"
  },
  {
    "id": "liquid/lfm-3-1.7b:free",
    "canonical_slug": "liquid/lfm-3-1.7b-20261106",
    "name": "LiquidAI: LFM3-1.7B (free)",
    "created": 1794009477,
    "description": "A compact 1.7B-parameter text model with a 256K-token context, post-trained for agents, tool calling, and structured outputs. It reasons before it answers. Prompts and outputs may be retained and used...",
    "context_length": 262144,
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 262144,
      "max_completion_tokens": 8192,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "frequency_penalty",
      "include_reasoning",
      "logprobs",
      "max_completion_tokens",
      "max_tokens",
      "min_p",
      "presence_penalty",
      "reasoning",
      "repetition_penalty",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_logprobs",
      "top_p"
    ],
    "default_parameters": {
      "temperature": 0.1,
      "top_k": 50,
      "repetition_penalty": 1.1
    },
    "hugging_face_id": "LiquidAI/LFM3-1.7B",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/liquid/lfm-3-1.7b-20261106/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": true
    },
    "supported_voices": null,
    "provider": "liquid"
  },
  {
    "id": "meta-llama/llama-3.3-70b-instruct:free",
    "name": "Llama 3.3 70B Instruct (free)",
    "provider": "meta-llama",
    "context_length": 131072,
    "max_completion_tokens": 8192,
    "description": "Strong general reasoning at 70B scale, versatile for structured analysis.",
    "supported_parameters": [
      "temperature",
      "top_p",
      "max_tokens",
      "response_format",
      "tools"
    ],
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "is_curated": true
  },
  {
    "id": "mistralai/mistral-small-3.1-24b-instruct:free",
    "name": "Mistral Small 3.1 24B (free)",
    "provider": "mistralai",
    "context_length": 128000,
    "max_completion_tokens": 8192,
    "description": "Fast, instruction-tuned, reliable JSON shaping.",
    "supported_parameters": [
      "temperature",
      "top_p",
      "max_tokens",
      "tools"
    ],
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "is_curated": true
  },
  {
    "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "canonical_slug": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning-20260428",
    "name": "NVIDIA: Nemotron 3 Nano Omni (free)",
    "created": 1777393095,
    "description": "NVIDIA Nemotron™ 3 Nano Omni is a 30B-A3B open multimodal model designed to function as a perception and context sub-agent in enterprise agent systems. It accepts text, image, video, and...",
    "context_length": 256000,
    "architecture": {
      "modality": "text+image+audio+video->text",
      "input_modalities": [
        "text",
        "audio",
        "image",
        "video"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 256000,
      "max_completion_tokens": 65536,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "seed",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {
      "temperature": 0.6,
      "top_p": 0.95,
      "top_k": null,
      "frequency_penalty": null,
      "presence_penalty": null,
      "repetition_penalty": null
    },
    "hugging_face_id": "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-BF16",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning-20260428/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false,
      "default_enabled": true,
      "supports_max_tokens": true
    },
    "supported_voices": null,
    "provider": "nvidia"
  },
  {
    "id": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "canonical_slug": "nvidia/nemotron-3-ultra-550b-a55b-20260604",
    "name": "NVIDIA: Nemotron 3 Ultra (free)",
    "created": 1780551208,
    "description": "NVIDIA Nemotron 3 Ultra is an open frontier-reasoning and orchestration model from NVIDIA, with 55B active parameters out of 550B total (MoE). Built on a hybrid Transformer-Mamba mixture-of-experts architecture, it...",
    "context_length": 1000000,
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1000000,
      "max_completion_tokens": 65536,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "reasoning_effort",
      "seed",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {
      "temperature": 1,
      "top_p": 0.95,
      "top_k": null,
      "frequency_penalty": null,
      "presence_penalty": null,
      "repetition_penalty": null
    },
    "hugging_face_id": "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/nvidia/nemotron-3-ultra-550b-a55b-20260604/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false,
      "default_enabled": true,
      "supports_max_tokens": true,
      "supported_efforts": [
        "high",
        "medium",
        "none"
      ],
      "default_effort": "high"
    },
    "supported_voices": null,
    "provider": "nvidia"
  },
  {
    "id": "nvidia/nemotron-3.5-lightning:free",
    "canonical_slug": "nvidia/nemotron-3.5-lightning-20260807",
    "name": "NVIDIA: Nemotron 3.5 Lightning (free)",
    "created": 1786452751,
    "description": "NVIDIA Nemotron 3.5 Lightning is an open mixture-of-experts model from NVIDIA, with 3B active parameters out of 30B total. It is suited for high-throughput agentic workloads and specialized tasks that...",
    "context_length": 1000000,
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1000000,
      "max_completion_tokens": 65536,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "seed",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {},
    "hugging_face_id": "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/nvidia/nemotron-3.5-lightning-20260807/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false
    },
    "supported_voices": null,
    "provider": "nvidia"
  },
  {
    "id": "nvidia/nemotron-3.5-super-vl:free",
    "canonical_slug": "nvidia/nemotron-3.5-super-vl-20261015",
    "name": "NVIDIA: Nemotron 3.5 Super VL (free)",
    "created": 1792076662,
    "description": "NVIDIA Nemotron 3.5 Super VL is an open multimodal mixture-of-experts model from NVIDIA, with 12B active parameters out of 120B total. It takes text, images, documents, GUI screenshots, and video...",
    "context_length": 1000000,
    "architecture": {
      "modality": "text+image+video->text",
      "input_modalities": [
        "text",
        "image",
        "video"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1000000,
      "max_completion_tokens": 131072,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ],
    "default_parameters": {},
    "hugging_face_id": "nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-BF16",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/nvidia/nemotron-3.5-super-vl-20261015/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false
    },
    "supported_voices": null,
    "provider": "nvidia"
  },
  {
    "id": "particle-ai/particle-1:free",
    "canonical_slug": "particle-ai/particle-1-20261027",
    "name": "Particle AI: Particle-1 (free)",
    "created": 1793207893,
    "description": "Particle-1 is a token-efficient agentic coding model from Particle AI, post-trained on DeepSeek V4.1 Flash. It is suited for software engineering work such as terminal workflows, codebase changes, and data...",
    "context_length": 1048576,
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 1048576,
      "max_completion_tokens": 131072,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "frequency_penalty",
      "include_reasoning",
      "logprobs",
      "max_tokens",
      "min_p",
      "presence_penalty",
      "reasoning",
      "reasoning_effort",
      "repetition_penalty",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_logprobs",
      "top_p"
    ],
    "default_parameters": {},
    "hugging_face_id": null,
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/particle-ai/particle-1-20261027/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": false,
      "default_enabled": true,
      "supported_efforts": [
        "max",
        "xhigh",
        "high",
        "medium",
        "low",
        "minimal",
        "none"
      ],
      "default_effort": "high"
    },
    "supported_voices": null,
    "provider": "particle-ai"
  },
  {
    "id": "qwen/qwen-2.5-72b-instruct:free",
    "name": "Qwen 2.5 72B Instruct (free)",
    "provider": "qwen",
    "context_length": 32768,
    "max_completion_tokens": 8192,
    "description": "Multilingual 72B model, good at tabular and comparative reasoning.",
    "supported_parameters": [
      "temperature",
      "top_p",
      "max_tokens"
    ],
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "is_curated": true
  },
  {
    "id": "recursive/flint-v1.0:free",
    "canonical_slug": "recursive/flint-v1.0-20261021",
    "name": "Recursive: Flint (free)",
    "created": 1792622765,
    "description": "Flint is an open-weight mixture-of-experts model from Recursive, with about 2.5B active parameters out of 40B total, built by Recursive's autoresearch system Eureka Machine for coding agents. It is suited...",
    "context_length": 262144,
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ],
      "tokenizer": "Other",
      "instruct_type": null
    },
    "pricing": {
      "prompt": "0",
      "completion": "0"
    },
    "top_provider": {
      "context_length": 262144,
      "max_completion_tokens": 235929,
      "is_moderated": false
    },
    "per_request_limits": null,
    "supported_parameters": [
      "include_reasoning",
      "logprobs",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "stop",
      "temperature",
      "tools",
      "top_logprobs",
      "top_p"
    ],
    "default_parameters": {},
    "hugging_face_id": "RecursiveSI/flint",
    "knowledge_cutoff": null,
    "expiration_date": null,
    "links": {
      "details": "/api/v1/models/recursive/flint-v1.0-20261021/endpoints"
    },
    "endpoints": [
      "/api/v1/chat/completions",
      "/api/v1/completions",
      "/api/v1/messages",
      "/api/v1/responses"
    ],
    "reasoning": {
      "mandatory": true
    },
    "supported_voices": null,
    "provider": "recursive"
  }
];

export const OR_MODEL_COUNT = OR_FREE_MODELS.length;
export const OR_SYNCED_AT = "2026-11-23T05:40:55.376Z";
