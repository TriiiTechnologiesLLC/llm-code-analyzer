# 🛡️ Code Analyzer

**Automated code security and quality analysis for ZIP archives using Ollama.**

`zip-code-analyzer.js` is a Node.js CLI tool designed to extract code files from a ZIP archive, analyze them for security vulnerabilities and logic errors using a local Large Language Model (Ollama), and generate structured reports.

### ✨ Features

*   **🗜️ ZIP Archive Support:** Directly analyzes code contained within `.zip` files without manual extraction.
*   **🧩 Smart Chunking:** Automatically splits large files into manageable chunks based on line integrity to respect model context limits.
*   **🔄 Multi-pass Analysis:**
    1.  **Chunk Analysis:** Analyzes individual code segments for specific issues.
    2.  **File Synthesis:** Merges chunk results into a cohesive, final report per file.
*   **📊 Flexible Reporting:** Exports analysis results to **Markdown (`.md`)** and **JSON (`.json`)**.
*   **⚙️ Configuration:** Fully customizable via `.env` (Model, Timeout, Chunk Size, Extensions, etc.).
*   **🔒 Local Processing:** Runs entirely locally via Ollama, keeping your source code private.

---

## 📋 Prerequisites

1.  **Node.js:** Version 14 or higher recommended.
2.  **Ollama:** Must be installed and running locally.
    *   [Download Ollama](https://ollama.ai/download)
    *   Ensure a model is installed (default is `gpt-oss:20b`).
    *   **Run Ollama before starting the analyzer:**
        ```bash
        ollama serve
        ```

---

## 🚀 Installation

1.  **Clone or download the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```
    *Required Packages:* `dotenv`, `adm-zip`, `axios`

3.  **Create Environment File:**
    Copy the default environment configuration:
    ```bash
    cp .env.example .env
    ```
    *(Or create a `.env` file manually based on the Configuration section below).*

---

## ⚙️ Configuration

Edit the `.env` file in the project root to customize behavior.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `OLLAMA_HOST` | URL of the Ollama API server | `http://localhost:11434` |
| `OLLAMA_MODEL` | The LLM model to use | `gpt-oss:20b` |
| `MAX_FILE_SIZE_KB` | Max size (KB) before chunking is triggered | `100` |
| `CHUNK_SIZE_KB` | Size limit per chunk (KB) | `40` |
| `ALLOWED_EXTENSIONS` | Comma-separated list of allowed file extensions | `.js,.jsx,.ts,.php...` |
| `ENABLE_REPORTING` | Enable/Disable report generation | `false` |
| `OUTPUT_FORMATS` | Comma-separated formats to export (`md`, `json`) | `md` |
| `REPORT_PREFIX` | Filename prefix for generated reports | `analysis_report` |
| `TIMEOUT` | API Request timeout in seconds | `3600` |

**Example `.env`:**
```ini
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gpt-oss:20b
MAX_FILE_SIZE_KB=100
CHUNK_SIZE_KB=40
ALLOWED_EXTENSIONS=.js,.py,.ts
ENABLE_REPORTING=true
OUTPUT_FORMATS=md,json
```

---

## 🏃 Usage

Run the analyzer from the command line, passing the path to the target ZIP file.

```bash
node zip-code-analyzer.js /path/to/target-archive.zip
```

### Example Output Log
```text
🚀 Zip Code Analyzer Initialized
📂 Target: my-project.zip
🤖 Model: gpt-oss:20b
📄 Reporting: Enabled
📏 Chunk Size: 40KB
━━━━━...

🔍 Processing: src/app.js
   📄 Analyzing single file (25.4KB)

✅ Analysis Preview:
──────────────────────────────────────────────
- Security Risk: Hardcoded API key found in line 45.
- Logic Error: Potential infinite loop in async fetch.
──────────────────────────────────────────────

🔍 Processing: src/utils/helper.ts
   📦 Large file detected (150.2KB). Chunking...
      > Chunk 1/4...
      > Chunk 2/4...
      > Synthesizing summary...

💾 Markdown report saved to: analysis_report_2023-10-27T10-00-00.md
💾 JSON report saved to: analysis_report_2023-10-27T10-00-00.json
🏁 Process Complete.
```

---

## 🛠️ How It Works

### 1. File Filtering
The script scans the ZIP archive and filters files based on `ALLOWED_EXTENSIONS`. Binary files are automatically skipped.

### 2. Chunking Logic
If a file exceeds `MAX_FILE_SIZE_KB`:
1.  The content is split by lines (`splitContentByLines`).
2.  Each chunk is analyzed independently by the LLM to ensure context limits aren't exceeded.
3.  A **Synthesis Prompt** combines all chunk analyses into a single file summary.

### 3. Reporting
If `ENABLE_REPORTING` is true:
*   **Markdown:** Human-readable summary with statistics and per-file breakdowns.
*   **JSON:** Machine-readable data structure for CI/CD integration.

---

## ⚠️ Security Note

While this tool runs locally, you should still be aware of the following:
*   **Code Privacy:** Your code is sent to your local Ollama instance. Ensure your Ollama host is secure.
*   **Sensitive Data:** Avoid analyzing ZIP files containing hardcoded secrets, API keys, or PII, as the LLM may inadvertently memorize patterns or log them.
*   **Dependencies:** Ensure all npm dependencies (`adm-zip`, `axios`, `dotenv`) are kept up to date.

---

## 📜 License

This project is licensed under the MIT License.

---

## 🤝 Contributing

Feel free to fork this repository and submit pull requests. Key areas for improvement include:
*   Supporting more compression formats (`.tar.gz`, `.rar`).
*   Refining LLM prompts for specific language standards.
