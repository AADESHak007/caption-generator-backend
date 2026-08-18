# Caption Generator - Video Processing Architecture & Benchmark Output

This document provides a comprehensive overview of the **Caption Generator** backend pipeline architecture, sequence flow, hosted deployment limitations, and a real sample API response.

---

## 1. Video Processing Pipeline Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend / Client Layer"]
        A["Raw Video File Input (.mp4, .webm, .mov)"] --> B["Upload Request POST /api/analyze-video"]
    end

    subgraph FFmpeg ["FFmpeg Normalization & Media Splitting"]
        B --> C["FFmpeg Service"]
        C --> D["Video Normalization<br/>(H.264 / AAC 1080p 30fps)"]
        D --> E1["Audio Extraction<br/>(16kHz Mono WAV)"]
        D --> E2["Frame Extraction<br/>(0.5 fps JPEG Frames)"]
    end

    subgraph AI ["AI Analysis Pipeline"]
        E1 --> F["Local Whisper Model<br/>(@xenova/transformers Xenova/whisper-tiny)"]
        F --> G["Timestamped Phrase Segments<br/>(Word grouping into 2-4s chunks)"]
        
        E2 --> H["Visual AI Model<br/>(Gemini 3.7 / 3.5 Flash OR OpenAI GPT-4o)"]
        G --> H
        
        H --> I["AI Enrichment<br/>• OCR Text Detection (detectedText)<br/>• Recommended Overlay (recommendedOverlayText)<br/>• Screen Position (top / middle / bottom)<br/>• Design Suggestions (recommendation)"]
    end

    subgraph Output ["Response & Cleanup"]
        I --> J["JSON API Response"]
        J --> K["Auto-Cleanup Temp Files<br/>(temp/ and uploads/)"]
        J --> L["Interactive Frontend Player<br/>(Real-time Synced Caption Overlays)"]
    end
```

---

## 2. Deployment & Free-Tier Infrastructure Limitations

> [!WARNING]
> **1. Render Free-Tier Memory Limit (512 MB RAM)**
> - **Issue**: The free instance tier on Render enforces a strict **512 MB memory limit**.
> - **Cause**: Loading the local Whisper speech-to-text model via `@xenova/transformers` initializes the native ONNX Runtime C++ engine (`onnxruntime-node`). Combining ONNX memory allocations with Node.js V8 heap and FFmpeg encoding processes causes memory usage to exceed 512MB.
> - **Result**: Render's Linux cgroups OOM (Out-Of-Memory) killer terminates the process, resulting in an `Instance failed: Ran out of memory` log and a `502 Bad Gateway` HTTP error.
> - **Recommendation**: Deploy on an instance with at least **1GB – 2GB RAM** (e.g., Render Starter plan) or offload Whisper STT to a cloud API.

> [!IMPORTANT]
> **2. Gemini API Free-Tier Quotas & Rate Limiting (429 / 503)**
> - **Issue**: Using free-tier Gemini API keys (`GEMINI_API_KEY`) frequently triggers rate-limit and high-demand errors:
>   `HTTP 503: This model is currently experiencing high demand. Please try again later.` or `HTTP 429: Resource Exhausted`.
> - **Recommendation**: Use a paid tier Gemini API key or switch the provider toggle to OpenAI (`llm: 'openai'`).

---

## 3. Real Sample API Benchmark Output

Below is the verified response output generated for `DISCIPLINE - Motivational Speech - Ben Lionel Scott (1080p, h264).mp4`:

```json
{
    "success": true,
    "filename": "DISCIPLINE - Motivational Speech - Ben Lionel Scott (1080p, h264).mp4",
    "llmProvider": "gemini",
    "keepTemp": false,
    "captionsCount": 5,
    "captions": [
        {
            "startTime": 0.1,
            "endTime": 2.76,
            "text": "The distance between your dreams and your reality right",
            "screenPosition": "top",
            "detectedText": "The distance between your dreams and your reality right now @BENLIONELSCOTT",
            "recommendedOverlayText": "DREAMS VS REALITY",
            "recommendation": "Use bold, uppercase typography placed at the top to complement the existing center subtitles and avoid silhouette overlap."
        },
        {
            "startTime": 2.76,
            "endTime": 6.06,
            "text": "now is discipline. discipline is",
            "screenPosition": "top",
            "detectedText": "is discipline. @BENLIONELSCOTT",
            "recommendedOverlayText": "IT'S DISCIPLINE",
            "recommendation": "Highlight keyword with high-contrast white text and subtle glow at top center."
        },
        {
            "startTime": 6.06,
            "endTime": 9.42,
            "text": "doing the things you hate to do, but do it like you",
            "screenPosition": "top",
            "detectedText": "Discipline is doing the things you hate to do, @BENLIONELSCOTT",
            "recommendedOverlayText": "DO WHAT YOU HATE",
            "recommendation": "Position bold text at top screen area to maintain focus on the boxer's movement."
        },
        {
            "startTime": 9.42,
            "endTime": 9.6,
            "text": "love",
            "screenPosition": "top",
            "detectedText": "but do it like you love it. @BENLIONELSCOTT",
            "recommendedOverlayText": "LIKE YOU LOVE IT",
            "recommendation": "Use punchy pop-in animation synced to the voice emphasis."
        },
        {
            "startTime": 9.6,
            "endTime": 15.14,
            "text": "it.",
            "screenPosition": "top",
            "detectedText": "but do it like you love it. @BENLIONELSCOTT",
            "recommendedOverlayText": "MASTER THE GRIND",
            "recommendation": "Keep clean modern font style at the top as outro hook while subject shadows box."
        }
    ]
}
```

---

## 4. Live Testing Example

The benchmark output in Section 3 was produced from a real end-to-end run against the locally hosted backend. This section documents the source clip, request configuration, and verified proof of execution.

### 4.1 Source Clip

| Field | Value |
| :--- | :--- |
| **Source URL** | https://youtube.com/shorts/48BnYG54694?si=aJ8yoqjWh_W-7K2E |
| **Format** | YouTube Short (vertical, 9:16) |
| **Local Filename** | `DISCIPLINE - Motivational Speech - Ben Lionel Scott (1080p, h264).mp4` |
| **Normalized Spec** | H.264 / AAC, 1080p, 30fps |
| **Analyzed Duration** | ~15.14s (final caption `endTime`) |

> [!NOTE]
> The clip was downloaded and normalized locally before being submitted to the API. The pipeline itself accepts a **raw video file upload** — it does not ingest YouTube URLs directly. The URL above is recorded only to identify the source of the test asset.

### 4.2 Request Configuration

| Parameter | Value |
| :--- | :--- |
| **Method** | `POST` |
| **Endpoint** | `http://localhost:3000/api/analyze-video` |
| **Body Type** | `form-data` |
| **Body Key** | `video` (type: `File`) |
| **LLM Provider** | `gemini` |
| **keepTemp** | `false` (auto-cleanup enabled) |

### 4.3 Verified Result

| Metric | Value |
| :--- | :--- |
| **HTTP Status** | `200 OK` |
| **Response Time** | `33.29 s` |
| **Response Size** | `1.97 KB` |
| **Captions Returned** | `5` |

### 4.4 Proof of Backend Execution

The screenshot below captures the live Postman run against the `analyze-video` route, showing the `200 OK` status, end-to-end latency, and the fully populated `captions` array with `screenPosition`, `detectedText`, `recommendedOverlayText`, and `recommendation` fields resolved per segment.

<img width="1188" height="878" alt="image" src="https://github.com/user-attachments/assets/bcb3fe11-b545-4fda-8d42-f66639126ec9" />


### 4.5 Latency Breakdown & Notes

The observed **33.29 s** response time is a single-threaded, cold-path run on a local machine. The dominant contributors, in order:

1. **FFmpeg normalization** — full re-encode to H.264/AAC 1080p30 before any analysis begins.
2. **Whisper inference** — `Xenova/whisper-tiny` running on CPU via ONNX Runtime.
3. **Visual model calls** — Gemini requests over frames extracted at 0.5 fps.
4. **Frame extraction & I/O** — JPEG writes plus temp-directory cleanup.

Known optimization levers for future iterations:

- Skip full re-encode when the input already conforms to the target spec (probe first, transcode only on mismatch).
- Run audio extraction/transcription **in parallel** with frame extraction rather than sequentially.
- Replace fixed 0.5 fps sampling with **shot-boundary sampling**, so static segments contribute one frame instead of many.
- Batch frames into fewer multimodal calls instead of per-frame requests.
